import type { SQLInputValue } from "node:sqlite";
import type { DB, CodeRow } from "./db.ts";
import { logAdmin } from "./db.ts";
import { formatCode, generateBatchId, generateRawCode, generateToken, safeEqual } from "./util.ts";
import type { ServerConfig } from "./config.ts";
import type { ApiResult } from "./api.ts";

const DAY_MS = 24 * 3600 * 1000;
const ADMIN_SESSION_TTL_MS = 12 * 3600 * 1000;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function int(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** 管理员登录：成功签发 12 小时会话 token（进程内保存）。 */
export function handleAdminLogin(
  db: DB,
  config: ServerConfig,
  sessions: Map<string, number>,
  body: unknown,
  ip: string,
): ApiResult {
  const password = typeof body === "object" && body !== null ? str((body as Record<string, unknown>).password) : "";
  if (!password || !safeEqual(password, config.adminPassword)) {
    logAdmin(db, "login_failed", null, `ip=${ip}`);
    return [401, { ok: false, message: "密码错误" }];
  }
  const token = generateToken(24);
  sessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  logAdmin(db, "login_ok", null, `ip=${ip}`);
  return [200, { token }];
}

export function isAdminAuthorized(sessions: Map<string, number>, authorization: string | undefined): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** 批量生成激活码（默认即“可售”状态，线下收款后发给买家即可）。 */
export function handleGenerateCodes(db: DB, body: unknown): ApiResult {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const count = Math.min(Math.max(int(record.count, 10), 1), 1000);
  const plan = str(record.plan) || "standard";
  const durationDays = Math.min(Math.max(int(record.durationDays, 365), 1), 3650);
  const note = str(record.note).slice(0, 200) || null;
  const batchId = generateBatchId();
  const now = Date.now();
  const codes: string[] = [];
  const insert = db.prepare(
    "INSERT INTO codes (code, batch_id, plan, status, duration_days, note, created_at) VALUES (?, ?, ?, 'unsold', ?, ?, ?)",
  );
  let guard = 0;
  while (codes.length < count) {
    guard += 1;
    if (guard > count * 20) return [500, { ok: false, message: "生成冲突，请重试" }];
    const raw = generateRawCode();
    try {
      insert.run(raw, batchId, plan, durationDays, note, now);
      codes.push(formatCode(raw));
    } catch {
      // UNIQUE 冲突：重生成
    }
  }
  logAdmin(db, "generate_batch", batchId, `count=${count} plan=${plan} days=${durationDays}`);
  return [200, { ok: true, batchId, codes }];
}

export interface ListQuery {
  q: string;
  status: string;
  limit: number;
  offset: number;
}

/** 码列表（含绑定设备信息），支持按码/备注/设备指纹搜索与状态过滤。 */
export function handleListCodes(db: DB, query: ListQuery): ApiResult {
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (query.status && query.status !== "all") {
    conditions.push("c.status = ?");
    params.push(query.status);
  }
  if (query.q) {
    // 码在库里存的是无连字符的原始串，搜索时把查询里的分隔符剥掉再匹配
    const rawLike = `%${query.q.toUpperCase().replace(/[^A-Z0-9]/g, "")}%`;
    const like = `%${query.q.replace(/[%_]/g, "")}%`;
    conditions.push("(c.code LIKE ? OR c.note LIKE ? OR d.fingerprint LIKE ?)");
    params.push(rawLike, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM codes c LEFT JOIN devices d ON d.code_id = c.id ${where}`)
    .get(...params) as { n: number }).n;
  const rows = db.prepare(
    `SELECT c.*, d.fingerprint AS device_fp, d.device_name, d.last_seen_at
     FROM codes c LEFT JOIN devices d ON d.code_id = c.id
     ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
  ).all(...params, query.limit, query.offset) as unknown as Array<CodeRow & {
    device_fp: string | null;
    device_name: string | null;
    last_seen_at: number | null;
  }>;
  return [200, {
    ok: true,
    total,
    items: rows.map((row) => ({
      code: formatCode(row.code),
      plan: row.plan,
      status: row.status,
      durationDays: row.duration_days,
      expiresAt: row.expires_at,
      note: row.note,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      deviceFingerprint: row.device_fp,
      deviceName: row.device_name,
      lastSeenAt: row.last_seen_at,
      batchId: row.batch_id,
    })),
  }];
}

function findCodeByFormatted(db: DB, formatted: string): CodeRow | undefined {
  const raw = formatted.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return db.prepare("SELECT * FROM codes WHERE code = ?").get(raw) as CodeRow | undefined;
}

/** 管理端解绑（无冷却限制）。 */
export function handleAdminUnbind(db: DB, code: string): ApiResult {
  const row = findCodeByFormatted(db, code);
  if (!row) return [404, { ok: false, message: "码不存在" }];
  db.prepare("DELETE FROM devices WHERE code_id = ?").run(row.id);
  db.prepare("DELETE FROM tokens WHERE code_id = ?").run(row.id);
  logAdmin(db, "unbind", row.code, "admin");
  return [200, { ok: true, message: "已解绑" }];
}

/** 封禁：立即失效（删除所有 token）。restore 恢复为 active。 */
export function handleAdminSetStatus(db: DB, code: string, status: "active" | "revoked"): ApiResult {
  const row = findCodeByFormatted(db, code);
  if (!row) return [404, { ok: false, message: "码不存在" }];
  db.prepare("UPDATE codes SET status = ? WHERE id = ?").run(status, row.id);
  if (status === "revoked") {
    db.prepare("DELETE FROM tokens WHERE code_id = ?").run(row.id);
  }
  logAdmin(db, status === "revoked" ? "revoke" : "restore", row.code, "admin");
  return [200, { ok: true, message: status === "revoked" ? "已封禁" : "已恢复" }];
}

/** 延期：仅对已激活的码生效，从"现在与到期时间的较大者"起加天数。 */
export function handleAdminExtend(db: DB, code: string, body: unknown): ApiResult {
  const row = findCodeByFormatted(db, code);
  if (!row) return [404, { ok: false, message: "码不存在" }];
  if (row.activated_at === null) {
    return [400, { ok: false, message: "该码尚未激活，请改生成时的有效期或激活后再延期" }];
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const days = Math.min(Math.max(int(record.days, 30), 1), 3650);
  const base = Math.max(Date.now(), row.expires_at ?? Date.now());
  const expiresAt = base + days * DAY_MS;
  db.prepare("UPDATE codes SET expires_at = ? WHERE id = ?").run(expiresAt, row.id);
  logAdmin(db, "extend", row.code, `+${days}d`);
  return [200, { ok: true, expiresAt, message: `已延期 ${days} 天` }];
}

/** 简仪表盘。 */
export function handleStats(db: DB): ApiResult {
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const now = Date.now();
  return [200, {
    ok: true,
    codes: { total: count("SELECT COUNT(*) AS n FROM codes"), unsold: count("SELECT COUNT(*) AS n FROM codes WHERE status = 'unsold'"), active: count("SELECT COUNT(*) AS n FROM codes WHERE status = 'active'"), revoked: count("SELECT COUNT(*) AS n FROM codes WHERE status = 'revoked'") },
    devices: count("SELECT COUNT(*) AS n FROM devices"),
    activeToday: count(`SELECT COUNT(*) AS n FROM devices WHERE last_seen_at > ${now - DAY_MS}`),
    activations7d: count(`SELECT COUNT(*) AS n FROM activation_logs WHERE ok = 1 AND at > ${now - 7 * DAY_MS}`),
  }];
}
