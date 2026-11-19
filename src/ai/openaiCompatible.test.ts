import { afterEach, describe, expect, it, vi } from "vitest";
import { buildUrl, openaiCompatibleProvider } from "./openaiCompatible";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildUrl", () => {
  it("去掉末尾斜杠后拼接路径", () => {
    expect(buildUrl("https://api.example.com/v1/", "/chat/completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(buildUrl("https://api.example.com/v1", "/models")).toBe(
      "https://api.example.com/v1/models",
    );
  });
});

describe("openaiCompatibleProvider.chat", () => {
  it("解析 SSE 流并把增量交给 onDelta", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const deltas: string[] = [];
    const result = await openaiCompatibleProvider.chat({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      onDelta: (delta) => deltas.push(delta),
    });

    expect(result.content).toBe("你好");
    expect(deltas).toEqual(["你", "好"]);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.example.com/v1/chat/completions");
    expect(call[1].headers).toMatchObject({ Authorization: "Bearer sk-test" });
    const body = JSON.parse(String(call[1].body));
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
  });

  it("chunk 在 delta 中间断开也能正确缓冲", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"del',
          'ta":{"content":"哈"}}]}\n\ndata: [DONE]\n\n',
        ]),
      ),
    );
    const result = await openaiCompatibleProvider.chat({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.content).toBe("哈");
  });

  it("服务端忽略 stream 返回完整 JSON 时也能解析", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "整段回复" } }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const result = await openaiCompatibleProvider.chat({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.content).toBe("整段回复");
  });

  it("非 2xx 时抛出带状态码的错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401, statusText: "Unauthorized" })),
    );
    await expect(
      openaiCompatibleProvider.chat({
        baseUrl: "https://api.example.com/v1",
        apiKey: "bad",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/401/);
  });
});

describe("openaiCompatibleProvider.listModels", () => {
  it("解析 /models 返回的模型列表", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: "m-b" }, { id: "m-a" }, {}] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const listModels = openaiCompatibleProvider.listModels;
    expect(listModels).toBeTypeOf("function");
    const models = await listModels!({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "",
    });
    expect(models).toEqual(["m-a", "m-b"]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.example.com/v1/models",
    );
  });
});

describe("openaiCompatibleProvider.generateImage", () => {
  const generateImage = openaiCompatibleProvider.generateImage;

  it("b64_json 直接转 dataURL，请求体带 prompt/model/response_format", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage!({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "kolors",
      prompt: "一只猫",
      size: "1024x1024",
    });
    expect(result.dataUrl).toBe("data:image/png;base64,QUJD");
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.example.com/v1/images/generations");
    const body = JSON.parse(String(call[1].body));
    expect(body).toMatchObject({ model: "kolors", prompt: "一只猫", response_format: "b64_json", size: "1024x1024" });
  });

  it("只回 url 时抓回文件转 dataURL", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images/generations")) {
        return new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/img.png" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(new Blob(["pngbytes"], { type: "image/png" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage!({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "kolors",
      prompt: "一只狗",
    });
    expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("没有图片数据时抛错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{}] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(
      generateImage!({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "kolors",
        prompt: "x",
      }),
    ).rejects.toThrow("服务没有返回图片数据");
  });
});
