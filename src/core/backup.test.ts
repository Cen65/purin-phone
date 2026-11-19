import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupFile } from "./backup";

/** 内存 localStorage 桩：底层用真对象，保证 Object.keys 能枚举出数据键 */
function stubStorage(): { store: Record<string, string> } {
  const store: Record<string, string> = {};
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return Object.keys(store).length;
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
      getItem: (key: string) => (key in store ? store[key] : null),
      key: (index: number) => Object.keys(store)[index] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
  return { store };
}

describe("backup", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createBackup 打包 purin.* 与 my-phone.* 键，忽略无关键", async () => {
    const { store } = stubStorage();
    store["purin.settings"] = '{"a":1}';
    store["purin.chat"] = '{"m":[]}';
    store["my-phone.notes"] = "旧数据";
    store["other-app.data"] = "不该进来";
    const { createBackup: fn } = await import("./backup");
    const backup = fn();
    expect(backup.type).toBe("purin.backup");
    expect(Object.keys(backup.data).sort()).toEqual(["my-phone.notes", "purin.chat", "purin.settings"]);
    expect(backup.data["purin.settings"]).toBe('{"a":1}');
  });

  it("restoreBackup 写回数据键并返回数量（过滤外来键）", async () => {
    const { store } = stubStorage();
    const backup: BackupFile = {
      type: "purin.backup",
      version: 1,
      createdAt: Date.now(),
      data: {
        "purin.settings": "{}",
        "purin.chat": "{}",
        "evil.key": "hax",
      },
    };
    const { restoreBackup: fn } = await import("./backup");
    expect(fn(JSON.stringify(backup))).toBe(2);
    expect(store["purin.settings"]).toBe("{}");
    expect("evil.key" in store).toBe(false);
  });

  it("非备份 JSON / 缺 type 抛错", async () => {
    stubStorage();
    const { restoreBackup: fn } = await import("./backup");
    expect(() => fn("not-json")).toThrow("备份文件不是有效的 JSON");
    expect(() => fn('{"type":"other"}')).toThrow("备份文件格式不正确");
  });
});
