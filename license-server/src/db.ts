import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DB = DatabaseSync;

export interface CodeRow {
  id: number;
  code: string;
  batch_id: string;
  plan: string;
  status: "unsold" | "active" | "revoked";
  duration_days: number;
  expires_at: number | null;
  note: string | null;
  created_at: number;
  activated_at: number | null;
  last_self_unbind_at: number | null;
}

export interface DeviceRow {
  id: number;
  code_id: number;
  fingerprint: string;
  device_name: string | null;
  bound_at: number;
  last_seen_at: number;
}

export interface TokenRow {
  token: string;
  code_id: number;
  device_fp: string;
  expires_at: number;
  created_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  batch_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'unsold',
  duration_days INTEGER NOT NULL DEFAULT 365,
  expires_at INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  last_self_unbind_at INTEGER
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL REFERENCES codes(id),
  fingerprint TEXT NOT NULL,
  device_name TEXT,
  bound_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(code_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code_id);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  code_id INTEGER NOT NULL REFERENCES codes(id),
  device_fp TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS activation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  device_fp TEXT,
  ip TEXT,
  ok INTEGER NOT NULL,
  message TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  code TEXT,
  detail TEXT,
  at INTEGER NOT NULL
);
`;

/**
 * 打开数据库。dbPath 为文件路径时确保目录存在并启用 WAL；
 * 传 ":memory:" 得到内存库（测试用）。
 */
export function openDb(dbPath: string, baseDir?: string): DB {
  let path = dbPath;
  if (dbPath !== ":memory:") {
    path = resolve(baseDir ?? process.cwd(), dbPath);
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SCHEMA);
  return db;
}

export function getCodeByRaw(db: DB, raw: string): CodeRow | undefined {
  return db.prepare("SELECT * FROM codes WHERE code = ?").get(raw) as CodeRow | undefined;
}

export function getDeviceByCode(db: DB, codeId: number): DeviceRow | undefined {
  return db.prepare("SELECT * FROM devices WHERE code_id = ?").get(codeId) as DeviceRow | undefined;
}

export function getToken(db: DB, token: string): TokenRow | undefined {
  return db.prepare("SELECT * FROM tokens WHERE token = ?").get(token) as TokenRow | undefined;
}

export function logActivation(db: DB, code: string | null, deviceFp: string | null, ip: string, ok: boolean, message: string): void {
  db.prepare("INSERT INTO activation_logs (code, device_fp, ip, ok, message, at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(code, deviceFp, ip, ok ? 1 : 0, message, Date.now());
}

export function logAdmin(db: DB, action: string, code: string | null, detail: string): void {
  db.prepare("INSERT INTO admin_logs (action, code, detail, at) VALUES (?, ?, ?, ?)")
    .run(action, code, detail, Date.now());
}
