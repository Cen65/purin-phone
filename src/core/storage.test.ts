import { describe, expect, it, vi } from "vitest";

/**
 * 更名迁移（my-phone → purin）：storage.ts 的顶层副作用在任何 persist hydrate 前执行。
 * 用 stubGlobal + 动态 import 保证迁移在受控的 localStorage 下运行。
 */
describe("storage 更名迁移", () => {
  it("旧 my-phone.* 数据搬到 purin.*；新 key 已有数据时不覆盖；旧 key 保留", async () => {
    const backing = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    });
    backing.set("my-phone.settings", '{"api":{"model":"old"}}');
    backing.set("purin.settings", '{"api":{"model":"new"}}'); // 新 key 已有数据
    backing.set("my-phone.chat", "[]");
    backing.set("purin.device", '{"fingerprint":"keep-me"}'); // device 也已有

    vi.resetModules();
    await import("./storage");

    expect(backing.get("purin.settings")).toContain("new"); // 不被旧数据覆盖
    expect(backing.get("purin.chat")).toBe("[]"); // 旧数据搬入新 key
    expect(backing.get("purin.device")).toContain("keep-me");
    expect(backing.get("my-phone.chat")).toBe("[]"); // 旧 key 保留，可回滚
    vi.unstubAllGlobals();
  });

  it("没有旧数据时不产生任何新 key", async () => {
    const backing = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    });
    vi.resetModules();
    await import("./storage");
    expect([...backing.keys()].filter((k) => k.startsWith("purin."))).toEqual([]);
    vi.unstubAllGlobals();
  });
});
