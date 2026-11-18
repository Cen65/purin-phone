import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCommercialConfig } from "./config";

function stubJson(body: unknown, ok = true): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } }),
  ));
}

describe("loadCommercialConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("默认/文件缺失 → open 单机模式", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no file")));
    expect(await loadCommercialConfig()).toEqual({ mode: "open", licenseServer: "" });
  });

  it("mode=open → 原样返回", async () => {
    stubJson({ mode: "open", licenseServer: "" });
    expect((await loadCommercialConfig()).mode).toBe("open");
  });

  it("mode=licensed + 合法地址 → 商用模式", async () => {
    stubJson({ mode: "licensed", licenseServer: "https://license.example.com" });
    const config = await loadCommercialConfig();
    expect(config.mode).toBe("licensed");
    expect(config.licenseServer).toBe("https://license.example.com");
  });

  it("licensed 但地址非法 → 回落 open（配置错误不挡启动）", async () => {
    stubJson({ mode: "licensed", licenseServer: "not-a-url" });
    expect((await loadCommercialConfig()).mode).toBe("open");
  });

  it("HTTP 错误 → 回落 open", async () => {
    stubJson({}, false);
    expect((await loadCommercialConfig()).mode).toBe("open");
  });
});
