/**
 * 全量备份与恢复（P4）。
 * 备份 = 把 localStorage 里 purin.*（以及历史 my-phone.*）的持久化键
 * 原样打包成一个 JSON 文件；恢复 = 写回后整页刷新，让 zustand persist 重新水合。
 * 注意：聊天图片存放在 IndexedDB（见 core/imageStore.ts），不在本备份范围内。
 */

import { downloadTextFile } from "./download";

export interface BackupFile {
  type: "purin.backup";
  version: 1;
  createdAt: number;
  /** localStorage 键 → 值（JSON 字符串原文） */
  data: Record<string, string>;
}

const KEY_PREFIXES = ["purin.", "my-phone."];

function isDataKey(key: string): boolean {
  return KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** 打包当前所有持久化数据 */
export function createBackup(): BackupFile {
  const data: Record<string, string> = {};
  if (typeof window === "undefined" || !window.localStorage) return { type: "purin.backup", version: 1, createdAt: Date.now(), data };
  const storage = window.localStorage;
  // 用 Storage 标准迭代协议（length + key(i)），不依赖 Object.keys 的属性枚举
  const seen = new Set<string>();
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || seen.has(key) || !isDataKey(key)) continue;
    seen.add(key);
    const value = storage.getItem(key);
    if (typeof value === "string") data[key] = value;
  }
  return { type: "purin.backup", version: 1, createdAt: Date.now(), data };
}

/** 备份导出为文件（purin-backup-YYYYMMDD-HHmm.json） */
export function downloadBackup(): void {
  const backup = createBackup();
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `purin-backup-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`;
  downloadTextFile(name, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}

/**
 * 从备份 JSON 恢复：把数据键写回 localStorage。
 * 返回写入的键数量。调用方随后应 location.reload() 让所有 store 重新水合。
 */
export function restoreBackup(json: string): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("备份文件不是有效的 JSON");
  }
  const backup = parsed as Partial<BackupFile>;
  if (backup?.type !== "purin.backup" || typeof backup.data !== "object" || backup.data === null) {
    throw new Error("备份文件格式不正确");
  }
  let restored = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    if (!isDataKey(key) || typeof value !== "string") continue;
    window.localStorage.setItem(key, value);
    restored += 1;
  }
  return restored;
}
