import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./http.ts";
import { openDb, type DB } from "./db.ts";
import { loadConfig, type ServerConfig } from "./config.ts";
import { RateLimiter } from "./util.ts";
import type { Server } from "node:http";

/** 起一个真实监听的测试服务器，用 global fetch 打端到端请求。 */
async function startServer(): Promise<{ server: Server; db: DB; base: string; config: ServerConfig }> {
  const config = loadConfig({
    httpPort: 0,
    adminPassword: "test-admin-pass",
    dataDir: "data",
    dbFile: ":memory:",
    selfUnbindCooldownDays: 30,
    tokenTtlDays: 7,
  });
  const db = openDb(":memory:");
  const server = createApp({
    config,
    db,
    rate: new RateLimiter(),
    adminSessions: new Map(),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("listen failed");
  return { server, db, base: `http://127.0.0.1:${address.port}`, config };
}

const FP_A = "device-aaaa-1111";
const FP_B = "device-bbbb-2222";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("激活流程端到端", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken = "";

  beforeAll(async () => {
    ctx = await startServer();
    const login = await fetch(`${ctx.base}/admin/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "test-admin-pass" }),
    });
    adminToken = String((await json(login)).token);
    const gen = await fetch(`${ctx.base}/admin/api/codes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ count: 1, plan: "pro", durationDays: 365, note: "e2e" }),
    });
    const genBody = await json(gen);
    const codes = (genBody.codes as string[] | undefined) ?? [];
    code = codes[0] ?? "";
  });
  afterAll(() => new Promise<void>((resolve) => ctx.server.close(() => resolve())));

  let code = "";
  let token = "";

  it("未配置码或格式错误 → 400", async () => {
    const res = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "AAAA", deviceFingerprint: FP_A }),
    });
    expect(res.status).toBe(400);
  });

  it("设备 A 激活成功，返回 token 与有效期", async () => {
    const res = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceFingerprint: FP_A, deviceName: "测试机 A" }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("active");
    expect(body.plan).toBe("pro");
    expect(typeof body.token).toBe("string");
    expect(typeof body.expiresAt).toBe("number");
    token = String(body.token);
  });

  it("同设备重复激活幂等（重签 token）", async () => {
    const res = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceFingerprint: FP_A }),
    });
    expect(res.status).toBe(200);
    token = String((await json(res)).token);
  });

  it("设备 B 激活同码 → 409 already_bound", async () => {
    const res = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceFingerprint: FP_B }),
    });
    expect(res.status).toBe(409);
    expect((await json(res)).reason).toBe("already_bound");
  });

  it("心跳成功且滚动续期", async () => {
    const res = await fetch(`${ctx.base}/api/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, deviceFingerprint: FP_A }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).valid).toBe(true);
  });

  it("心跳设备不匹配 → 401", async () => {
    const res = await fetch(`${ctx.base}/api/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, deviceFingerprint: FP_B }),
    });
    expect(res.status).toBe(401);
    expect((await json(res)).reason).toBe("device_mismatch");
  });

  it("自助解绑：成功后新设备可激活，30 天内二次解绑被冷却", async () => {
    const res = await fetch(`${ctx.base}/api/deactivate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, deviceFingerprint: FP_A }),
    });
    expect(res.status).toBe(200);

    // 冷却期内，绑定 B 再尝试自助解绑 → 429
    const bindB = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceFingerprint: FP_B }),
    });
    expect(bindB.status).toBe(200);
    const tokenB = String((await json(bindB)).token);
    const again = await fetch(`${ctx.base}/api/deactivate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: tokenB, deviceFingerprint: FP_B }),
    });
    expect(again.status).toBe(429);
    expect((await json(again)).reason).toBe("cooldown");
    token = tokenB;
  });

  it("封禁后心跳立即失效（token 已被删除）", async () => {
    const res = await fetch(`${ctx.base}/admin/api/codes/${encodeURIComponent(code)}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const hb = await fetch(`${ctx.base}/api/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, deviceFingerprint: FP_B }),
    });
    expect(hb.status).toBe(401);
  });
});

describe("管理后台 API", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  let adminToken = "";
  let code = "";

  beforeAll(async () => {
    ctx = await startServer();
    const login = await fetch(`${ctx.base}/admin/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(login.status).toBe(401); // 错密码
    const ok = await fetch(`${ctx.base}/admin/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "test-admin-pass" }),
    });
    adminToken = String((await json(ok)).token);
  });
  afterAll(() => new Promise<void>((resolve) => ctx.server.close(() => resolve())));

  it("未带 token 的管理请求 → 401", async () => {
    const res = await fetch(`${ctx.base}/admin/api/stats`);
    expect(res.status).toBe(401);
  });

  it("生成码：数量/格式正确", async () => {
    const res = await fetch(`${ctx.base}/admin/api/codes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ count: 3, durationDays: 90 }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    const codes = body.codes as string[];
    expect(codes).toHaveLength(3);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    code = codes[0];
  });

  it("列表：能看到生成的码，且字段为 camelCase", async () => {
    const res = await fetch(`${ctx.base}/admin/api/codes?limit=10`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(3);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items[0].durationDays).toBe(90);
    expect(items[0].status).toBe("unsold");
  });

  it("搜索与状态过滤", async () => {
    const res = await fetch(`${ctx.base}/admin/api/codes?q=${encodeURIComponent(code)}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = await json(res);
    expect(body.total).toBe(1);
  });

  it("未激活的码延期 → 400；先激活再延期成功", async () => {
    const res = await fetch(`${ctx.base}/admin/api/codes/${encodeURIComponent(code)}/extend`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ days: 30 }),
    });
    expect(res.status).toBe(400); // 未激活

    const activate = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceFingerprint: FP_A }),
    });
    expect(activate.status).toBe(200);
    const extend = await fetch(`${ctx.base}/admin/api/codes/${encodeURIComponent(code)}/extend`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ days: 30 }),
    });
    expect(extend.status).toBe(200);
    const body = await json(extend);
    expect(typeof body.expiresAt).toBe("number");
  });

  it("解绑：设备记录清除，可重新激活", async () => {
    const res = await fetch(`${ctx.base}/admin/api/codes/${encodeURIComponent(code)}/unbind`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const activate = await fetch(`${ctx.base}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceFingerprint: FP_B }),
    });
    expect(activate.status).toBe(200);
  });

  it("stats 汇总数字正确", async () => {
    const res = await fetch(`${ctx.base}/admin/api/stats`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = await json(res);
    const codes = body.codes as Record<string, number>;
    expect(codes.total).toBe(3);
    expect(codes.active).toBeGreaterThanOrEqual(1);
  });

  it("备份下载返回 SQLite 文件头", async () => {
    const res = await fetch(`${ctx.base}/admin/api/backup`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 15).toString("latin1")).toBe("SQLite format 3");
  });

  it("管理页面 /admin 返回 HTML", async () => {
    const res = await fetch(`${ctx.base}/admin`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
