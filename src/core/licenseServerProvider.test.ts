import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLicenseServerProvider } from "./licenseServerProvider";
import { safeLocalStorage } from "./storage";

const BASE = "https://license.example.com";
const STORAGE_KEY = "purin.license";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("licenseServerProvider", () => {
  beforeEach(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    safeLocalStorage.removeItem(STORAGE_KEY);
  });

  it("未激活 → unactivated；activate 成功后缓存并返回 active", async () => {
    const provider = createLicenseServerProvider(BASE);
    expect(provider.describe().status).toBe("unactivated");

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { status: "active", token: "tok-1", plan: "pro", expiresAt: Date.now() + 86_400_000 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await provider.activate("AAAA-BBBB", { fingerprint: "fp-test", name: "测试" });
    expect(outcome.status).toBe("active");
    expect(outcome.plan).toBe("pro");
    expect(provider.describe().status).toBe("active");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BASE}/api/activate`);
    expect(body.deviceFingerprint).toBe("fp-test");
  });

  it("409 already_bound → 提示联系卖家，状态不变成 active", async () => {
    const provider = createLicenseServerProvider(BASE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(409, { reason: "already_bound", message: "该激活码已绑定其他设备，请联系卖家解绑" }),
    ));
    const outcome = await provider.activate("AAAA-BBBB", { fingerprint: "fp-test" });
    expect(outcome.status).not.toBe("active");
    expect(outcome.message).toContain("其他设备");
    expect(provider.describe().status).toBe("unactivated");
  });

  it("心跳成功更新 lastCheckedAt；7 天未验证 → expired 宽限提示", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const provider = createLicenseServerProvider(BASE);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      jsonResponse(200, {
        status: "active",
        token: "tok-1",
        plan: "standard",
        expiresAt: Date.now() + 365 * 86_400_000,
      }),
    ));
    await provider.activate("AAAA-BBBB", { fingerprint: "fp-test" });
    expect(provider.describe().status).toBe("active");

    // 快进 8 天，refresh 网络失败（离线）→ 宽限已过 → expired
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.setSystemTime(new Date("2026-01-09T00:00:00Z"));
    const state = await provider.refresh!({ fingerprint: "fp-test" });
    expect(state.status).toBe("expired");
    expect(state.message).toContain("7 天");
  });

  it("心跳 401 revoked → 本地标记 revoked；describe 显示已停用", async () => {
    const provider = createLicenseServerProvider(BASE);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/activate")) {
        return jsonResponse(200, { status: "active", token: "tok-1", plan: "standard", expiresAt: Date.now() + 86_400_000 });
      }
      return jsonResponse(401, { valid: false, reason: "revoked", message: "授权已被停用" });
    }));
    await provider.activate("AAAA-BBBB", { fingerprint: "fp-test" });
    const state = await provider.refresh!({ fingerprint: "fp-test" });
    expect(state.status).toBe("revoked");
    expect(provider.describe().status).toBe("revoked");
  });

  it("心跳 token_expired → 清缓存回到 unactivated（同设备重输码即可）", async () => {
    const provider = createLicenseServerProvider(BASE);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/activate")) {
        return jsonResponse(200, { status: "active", token: "tok-1", plan: "standard", expiresAt: Date.now() + 86_400_000 });
      }
      return jsonResponse(401, { valid: false, reason: "token_expired", message: "令牌已过期" });
    }));
    await provider.activate("AAAA-BBBB", { fingerprint: "fp-test" });
    const state = await provider.refresh!({ fingerprint: "fp-test" });
    expect(state.status).toBe("unactivated");
  });

  it("deactivate 成功清缓存；429 冷却提示透传", async () => {
    const provider = createLicenseServerProvider(BASE);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/activate")) {
        return jsonResponse(200, { status: "active", token: "tok-1", plan: "standard", expiresAt: Date.now() + 86_400_000 });
      }
      if (url.endsWith("/api/deactivate")) {
        return jsonResponse(200, { ok: true, message: "已解绑，可在新设备上重新激活（有效期不变）" });
      }
      return jsonResponse(200, { valid: true });
    }));
    await provider.activate("AAAA-BBBB", { fingerprint: "fp-test" });
    const ok = await provider.deactivate!();
    expect(ok.status).toBe("unactivated");
    expect(ok.message).toContain("新设备");
    expect(provider.describe().status).toBe("unactivated");

    // 冷却场景
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/activate")) {
        return jsonResponse(200, { status: "active", token: "tok-2", plan: "standard", expiresAt: Date.now() + 86_400_000 });
      }
      return jsonResponse(429, { ok: false, reason: "cooldown", retryAt: Date.now() + 86_400_000, message: "每 30 天可自助解绑一次" });
    }));
    await provider.activate("AAAA-BBBB", { fingerprint: "fp-test" });
    const cooled = await provider.deactivate!();
    expect(cooled.status).not.toBe("unactivated");
    expect(cooled.message).toContain("30 天");
  });
});
