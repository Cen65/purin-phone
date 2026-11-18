import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import type { DB } from "./db.ts";
import type { ServerConfig } from "./config.ts";
import { handleActivate, handleHeartbeat, handleSelfDeactivate, type ApiResult } from "./api.ts";
import {
  handleAdminLogin,
  isAdminAuthorized,
  handleGenerateCodes,
  handleListCodes,
  handleAdminUnbind,
  handleAdminSetStatus,
  handleAdminExtend,
  handleStats,
} from "./adminApi.ts";
import type { RateLimiter } from "./util.ts";

export interface AppContext {
  config: ServerConfig;
  db: DB;
  rate: RateLimiter;
  adminSessions: Map<string, number>;
  log?: (msg: string) => void;
}

const MAX_BODY_BYTES = 4096;

function send(res: ServerResponse, result: ApiResult, cors = false): void {
  const [status, body] = result;
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (cors) {
    headers["access-control-allow-origin"] = "*";
    headers["access-control-allow-methods"] = "POST, GET, OPTIONS";
    headers["access-control-allow-headers"] = "content-type, authorization";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

let adminHtmlCache: Buffer | null = null;
function adminHtml(): Buffer {
  if (!adminHtmlCache) {
    const here = dirname(fileURLToPath(import.meta.url));
    adminHtmlCache = readFileSync(resolve(here, "../public/admin.html"));
  }
  return adminHtmlCache;
}

function backupFile(db: DB, config: ServerConfig): string {
  const tmp = join(config.dataDir, `backup-${Date.now()}.tmp.db`);
  const abs = resolve(process.cwd(), tmp);
  mkdirSync(dirname(abs), { recursive: true });
  db.exec(`VACUUM INTO '${abs.replace(/\\/g, "/").replace(/'/g, "''")}'`);
  return abs;
}

export function createApp(ctx: AppContext): Server {
  const { config, db, rate, adminSessions, log } = ctx;

  async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    if (req.method === "OPTIONS") {
      send(res, [204, {}], true);
      return;
    }
    if (pathname === "/api/activate" && req.method === "POST") {
      if (!rate.allow(`act:${clientIp(req)}`, 20, 3600_000)) {
        send(res, [429, { reason: "rate_limited", message: "请求过于频繁，请稍后再试" }], true);
        return;
      }
      send(res, handleActivate(db, config, await readJsonBody(req), clientIp(req)), true);
      return;
    }
    if (pathname === "/api/heartbeat" && req.method === "POST") {
      if (!rate.allow(`hb:${clientIp(req)}`, 60, 3600_000)) {
        send(res, [429, { valid: false, reason: "rate_limited" }], true);
        return;
      }
      send(res, handleHeartbeat(db, config, await readJsonBody(req)), true);
      return;
    }
    if (pathname === "/api/deactivate" && req.method === "POST") {
      send(res, handleSelfDeactivate(db, config, await readJsonBody(req), clientIp(req)), true);
      return;
    }
    send(res, [404, { message: "not found" }], true);
  }

  async function handleAdmin(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    if (req.method === "GET" && (pathname === "/admin" || pathname === "/admin/")) {
      const html = adminHtml();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }
    if (pathname === "/admin/api/login" && req.method === "POST") {
      if (!rate.allow(`login:${clientIp(req)}`, 10, 3600_000)) {
        send(res, [429, { ok: false, message: "尝试过于频繁，请稍后再试" }]);
        return;
      }
      send(res, handleAdminLogin(db, config, adminSessions, await readJsonBody(req), clientIp(req)));
      return;
    }
    if (!isAdminAuthorized(adminSessions, req.headers.authorization)) {
      send(res, [401, { ok: false, message: "未登录或会话过期" }]);
      return;
    }
    if (pathname === "/admin/api/stats" && req.method === "GET") {
      send(res, handleStats(db));
      return;
    }
    if (pathname === "/admin/api/codes" && req.method === "POST") {
      send(res, handleGenerateCodes(db, await readJsonBody(req)));
      return;
    }
    if (pathname === "/admin/api/codes" && req.method === "GET") {
      const url = new URL(req.url ?? "/", "http://localhost");
      send(res, handleListCodes(db, {
        q: url.searchParams.get("q") ?? "",
        status: url.searchParams.get("status") ?? "all",
        limit: Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 500),
        offset: Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0),
      }));
      return;
    }
    if (pathname.startsWith("/admin/api/codes/") && pathname.split("/").length === 6) {
      // /admin/api/codes/:code/:action
      const parts = pathname.split("/");
      const code = decodeURIComponent(parts[4]);
      const action = parts[5];
      if (req.method !== "POST") {
        send(res, [405, { ok: false, message: "method not allowed" }]);
        return;
      }
      const body = await readJsonBody(req);
      if (action === "unbind") { send(res, handleAdminUnbind(db, code)); return; }
      if (action === "revoke") { send(res, handleAdminSetStatus(db, code, "revoked")); return; }
      if (action === "restore") { send(res, handleAdminSetStatus(db, code, "active")); return; }
      if (action === "extend") { send(res, handleAdminExtend(db, code, body)); return; }
    }
    if (pathname === "/admin/api/backup" && req.method === "GET") {
      const file = backupFile(db, config);
      try {
        const data = readFileSync(file);
        res.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="license-backup-${new Date().toISOString().slice(0, 10)}.db"`,
        });
        res.end(data);
      } finally {
        try { unlinkSync(file); } catch { /* 忽略清理失败 */ }
      }
      return;
    }
    send(res, [404, { ok: false, message: "not found" }]);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const promise = pathname.startsWith("/api/")
      ? handleApi(req, res, pathname)
      : pathname.startsWith("/admin")
        ? handleAdmin(req, res, pathname)
        : Promise.resolve(send(res, [404, { message: "not found" }]));
    promise.catch((err) => {
      log?.(`[error] ${req.method} ${pathname}: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        send(res, [400, { reason: "bad_request", message: "请求体格式错误" }], pathname.startsWith("/api/"));
      } else {
        res.destroy();
      }
    });
  });
  return server;
}
