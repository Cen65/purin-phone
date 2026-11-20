import { beforeEach, describe, expect, it, vi } from "vitest";

/** seed 依赖 safeLocalStorage（模块级 memory 兜底），用可重置的桩 + 动态 import 隔离 */
beforeEach(() => {
  vi.resetModules();
});

async function setup(prepare?: (storage: Record<string, string>) => void) {
  const backing: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => backing[key] ?? null,
    setItem: (key: string, value: string) => void (backing[key] = value),
    removeItem: (key: string) => void delete backing[key],
  });
  prepare?.(backing);
  const { ensureSeed } = await import("./seed");
  const { useCharactersStore } = await import("./charactersStore");
  return { ensureSeed, useCharactersStore, backing };
}

describe("种子数据 · 布丁兔", () => {
  it("空通讯录：添加布丁兔并打标记", async () => {
    const { ensureSeed, useCharactersStore, backing } = await setup();
    ensureSeed();
    const characters = useCharactersStore.getState().characters;
    expect(characters).toHaveLength(1);
    expect(characters[0]?.name).toBe("布丁兔");
    expect(characters[0]?.avatar).toBe("svg:bunny");
    expect(characters[0]?.systemPrompt).toContain("世界书");
    expect(backing["purin.seed.v2"]).toBe("1");
  });

  it("存量用户：无标记时补一只，已标记不再补（删掉不复活）", async () => {
    const first = await setup();
    first.ensureSeed();
    // 模拟用户把布丁兔删了、又添加了自己的角色
    first.useCharactersStore.setState({
      characters: [
        { id: "c9", name: "阿茶", avatar: "🍵", tagline: "", systemPrompt: "s", createdAt: 1 },
      ],
    });

    const second = await setup((backing) => void (backing["purin.seed.v2"] = "1"));
    second.ensureSeed();
    expect(second.useCharactersStore.getState().characters).toHaveLength(1); // 不复活

    const third = await setup(); // 老数据、从没见过布丁兔
    third.useCharactersStore.setState({
      characters: [
        { id: "c1", name: "小绿", avatar: "🌱", tagline: "", systemPrompt: "s", createdAt: 1 },
      ],
    });
    third.ensureSeed();
    const names = third.useCharactersStore.getState().characters.map((c) => c.name);
    expect(names).toEqual(["小绿", "布丁兔"]);
  });
});
