import type { DB, CodeRow } from "./db.ts";
import { getCodeByRaw, getDeviceByCode, getToken, logActivation } from "./db.ts";
import { generateToken, isValidCodeShape, normalizeCode } from "./util.ts";
import type { ServerConfig } from "./config.ts";

/** 统一的响应结构：[HTTP 状态码, JSON 体]。 */
export type ApiResult = [number, Record<string, unknown>];

const DAY_MS = 24 * 3600 * 1000;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 校验请求体并归一化，失败返回 null。 */
function readActivateBody(body: unknown): { code: string; fingerprint: string; name: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const code = normalizeCode(str(record.code));
  const fingerprint = str(record.deviceFingerprint);
  if (!isValidCodeShape(code) || fingerprint.length < 4) return null;
  return { code, fingerprint, name: str(record.deviceName).slice(0, 120) };
}

function issueToken(db: DB, codeRow: CodeRow, fingerprint: string, config: ServerConfig): string {
  const token = generateToken();
  const now = Date.now();
  db.prepare("DELETE FROM tokens WHERE code_id = ?").run(codeRow.id);
  db.prepare("INSERT INTO tokens (token, code_id, device_fp, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(token, codeRow.id, fingerprint, now + config.tokenTtlDays * DAY_MS, now);
  return token;
}

/**
 * 激活：一码一设备。
 * 同设备重复激活幂等（重新签发 token）；他设备激活 → 409；
 * 封禁 → 403 revoked；到期 → 403 expired。
 */
export function handleActivate(db: DB, config: ServerConfig, body: unknown, ip: string): ApiResult {
  const parsed = readActivateBody(body);
  if (!parsed) {
    logActivation(db, null, null, ip, false, "bad_request");
    return [400, { reason: "bad_code", message: "激活码格式不正确" }];
  }
  const codeRow = getCodeByRaw(db, parsed.code);
  if (!codeRow) {
    logActivation(db, parsed.code, parsed.fingerprint, ip, false, "bad_code");
    return [400, { reason: "bad_code", message: "激活码无效" }];
  }
  if (codeRow.status === "revoked") {
    logActivation(db, parsed.code, parsed.fingerprint, ip, false, "revoked");
    return [403, { reason: "revoked", message: "该激活码已被停用，请联系卖家" }];
  }
  const now = Date.now();
  const device = getDeviceByCode(db, codeRow.id);
  if (device && device.fingerprint !== parsed.fingerprint) {
    logActivation(db, parsed.code, parsed.fingerprint, ip, false, "already_bound");
    return [409, { reason: "already_bound", message: "该激活码已绑定其他设备，请联系卖家解绑" }];
  }
  if (codeRow.expires_at !== null && codeRow.expires_at <= now) {
    logActivation(db, parsed.code, parsed.fingerprint, ip, false, "expired");
    return [403, { reason: "expired", message: "该激活码已到期" }];
  }
  // 首次激活：确定有效期
  if (codeRow.activated_at === null) {
    const expiresAt = now + codeRow.duration_days * DAY_MS;
    db.prepare("UPDATE codes SET activated_at = ?, expires_at = ?, status = 'active' WHERE id = ?")
      .run(now, expiresAt, codeRow.id);
    codeRow.activated_at = now;
    codeRow.expires_at = expiresAt;
    codeRow.status = "active";
  }
  if (!device) {
    db.prepare("INSERT INTO devices (code_id, fingerprint, device_name, bound_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
      .run(codeRow.id, parsed.fingerprint, parsed.name || null, now, now);
  }
  const token = issueToken(db, codeRow, parsed.fingerprint, config);
  logActivation(db, parsed.code, parsed.fingerprint, ip, true, "ok");
  return [200, { status: "active", token, plan: codeRow.plan, expiresAt: codeRow.expires_at }];
}

function readTokenBody(body: unknown): { token: string; fingerprint: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const token = str(record.token);
  const fingerprint = str(record.deviceFingerprint);
  if (token.length < 8 || fingerprint.length < 4) return null;
  return { token, fingerprint };
}

/** 心跳：校验 token + 设备 + 码状态，滚动续期 token，更新 last_seen。 */
export function handleHeartbeat(db: DB, config: ServerConfig, body: unknown): ApiResult {
  const parsed = readTokenBody(body);
  if (!parsed) return [400, { valid: false, reason: "bad_request" }];
  const tokenRow = getToken(db, parsed.token);
  const now = Date.now();
  if (!tokenRow || tokenRow.expires_at <= now) {
    return [401, { valid: false, reason: "token_expired", message: "令牌已过期，请重新输入激活码激活（同设备免费）" }];
  }
  if (tokenRow.device_fp !== parsed.fingerprint) {
    return [401, { valid: false, reason: "device_mismatch", message: "设备不匹配" }];
  }
  const codeRow = db.prepare("SELECT * FROM codes WHERE id = ?").get(tokenRow.code_id) as CodeRow | undefined;
  if (!codeRow) return [401, { valid: false, reason: "bad_token" }];
  if (codeRow.status === "revoked") return [401, { valid: false, reason: "revoked", message: "授权已被停用" }];
  if (codeRow.expires_at !== null && codeRow.expires_at <= now) {
    return [401, { valid: false, reason: "expired", message: "激活码已到期" }];
  }
  db.prepare("UPDATE tokens SET expires_at = ? WHERE token = ?")
    .run(now + config.tokenTtlDays * DAY_MS, parsed.token);
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE code_id = ?").run(now, codeRow.id);
  return [200, { valid: true, plan: codeRow.plan, expiresAt: codeRow.expires_at }];
}

/** 用户自助解绑（换设备用），受冷却期限制；管理端解绑不受限。 */
export function handleSelfDeactivate(db: DB, config: ServerConfig, body: unknown, ip: string): ApiResult {
  const parsed = readTokenBody(body);
  if (!parsed) return [400, { ok: false, reason: "bad_request" }];
  const tokenRow = getToken(db, parsed.token);
  const now = Date.now();
  if (!tokenRow || tokenRow.expires_at <= now || tokenRow.device_fp !== parsed.fingerprint) {
    return [401, { ok: false, reason: "bad_token", message: "令牌无效" }];
  }
  const codeRow = db.prepare("SELECT * FROM codes WHERE id = ?").get(tokenRow.code_id) as CodeRow | undefined;
  if (!codeRow) return [401, { ok: false, reason: "bad_token" }];
  const cooldownMs = config.selfUnbindCooldownDays * DAY_MS;
  if (codeRow.last_self_unbind_at !== null && now - codeRow.last_self_unbind_at < cooldownMs) {
    const retryAt = codeRow.last_self_unbind_at + cooldownMs;
    return [429, {
      ok: false,
      reason: "cooldown",
      retryAt,
      message: `每 ${config.selfUnbindCooldownDays} 天可自助解绑一次，下次可解绑时间：${new Date(retryAt).toLocaleString()}`,
    }];
  }
  db.prepare("DELETE FROM devices WHERE code_id = ?").run(codeRow.id);
  db.prepare("DELETE FROM tokens WHERE code_id = ?").run(codeRow.id);
  db.prepare("UPDATE codes SET last_self_unbind_at = ? WHERE id = ?").run(now, codeRow.id);
  logActivation(db, codeRow.code, parsed.fingerprint, ip, true, "self_unbind");
  return [200, { ok: true, message: "已解绑，可在新设备上重新激活（有效期不变）" }];
}
