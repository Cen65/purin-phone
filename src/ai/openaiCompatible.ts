import type { ChatRequest, ChatResult, LLMProvider, ProviderConfig } from "./types";

/**
 * OpenAI 兼容 Provider（覆盖 OpenAI / DeepSeek / 通义 / 中转站等绝大多数服务）。
 * 使用 fetch + SSE 流式解析，无任何 SDK 依赖。
 */

export function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}${path}`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function readError(response: Response): Promise<string> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // ignore
  }
  return `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`;
}

/** 解析 SSE 数据行；对 chunk 边界做了缓冲处理 */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data) onEvent(data);
    }
  }
  if (buffer.trim().startsWith("data:")) {
    const data = buffer.trim().slice(5).trim();
    if (data) onEvent(data);
  }
}

function extractDelta(json: string): string {
  try {
    const parsed = JSON.parse(json) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    };
    const choice = parsed.choices?.[0];
    return choice?.delta?.content ?? choice?.message?.content ?? "";
  } catch {
    return "";
  }
}

export const openaiCompatibleProvider: LLMProvider = {
  id: "openai-compatible",
  label: "OpenAI 兼容接口",

  async chat(request: ChatRequest): Promise<ChatResult> {
    const { onDelta, signal } = request;
    const response = await fetch(buildUrl(request.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: authHeaders(request.apiKey),
      signal,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    });
    if (!response.ok) throw new Error(await readError(response));

    const contentType = response.headers.get("content-type") ?? "";
    // 某些中转/网关会忽略 stream 参数，返回完整 JSON —— 做双格式兼容
    if (!contentType.includes("text/event-stream")) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      onDelta?.(content);
      return { content };
    }

    let content = "";
    await readSseStream(response.body!, (data) => {
      if (data === "[DONE]") return;
      const delta = extractDelta(data);
      if (delta) {
        content += delta;
        onDelta?.(delta);
      }
    });
    return { content };
  },

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(buildUrl(config.baseUrl, "/models"), {
      headers: authHeaders(config.apiKey),
      signal,
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    return (data.data ?? [])
      .map((item) => item.id ?? "")
      .filter((id) => id.length > 0)
      .sort();
  },

  async testConnection(config: ProviderConfig) {
    try {
      const models = (await this.listModels?.(config)) ?? [];
      return {
        ok: true,
        message: models.length
          ? `连接成功，发现 ${models.length} 个模型`
          : "连接成功（服务未返回模型列表）",
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};
