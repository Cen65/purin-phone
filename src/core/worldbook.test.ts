import { describe, it, expect } from "vitest";
import {
  entryTriggered,
  scanTextOf,
  collectWorldbookContext,
  parseWorldbookJson,
  parseWorldbookText,
  worldbookToJson,
  type Worldbook,
  type WorldbookEntry,
} from "./worldbook";

function entry(patch: Partial<WorldbookEntry> & Pick<WorldbookEntry, "title" | "content">): WorldbookEntry {
  return {
    id: `e-${patch.title}`,
    mode: "keyword",
    keys: [],
    pattern: "",
    priority: 0,
    enabled: true,
    position: "system",
    ...patch,
  };
}

describe("entryTriggered 触发逻辑", () => {
  it("disabled 或空内容不触发", () => {
    const e = entry({ title: "a", content: "x", enabled: false });
    expect(entryTriggered(e, "anything")).toBe(false);
    expect(entryTriggered(entry({ title: "b", content: "  " }), "anything")).toBe(false);
  });

  it("always 常驻无条件触发", () => {
    const e = entry({ title: "世界观", content: "魔法世界", mode: "always" });
    expect(entryTriggered(e, "")).toBe(true);
  });

  it("keyword 忽略大小写、任一命中即触发、空关键词不触发", () => {
    const e = entry({ title: "猫", content: "提到猫", keys: ["Cat", " 布丁 "] });
    expect(entryTriggered(e, "我养了一只CAT")).toBe(true);
    expect(entryTriggered(e, "布丁真可爱")).toBe(true);
    expect(entryTriggered(e, "今天天气好")).toBe(false);
    expect(entryTriggered(entry({ title: "空", content: "x", keys: ["  "] }), "任何")).toBe(false);
  });

  it("regex 匹配触发；无效正则永不触发", () => {
    const e = entry({ title: "时间", content: "问时间", mode: "regex", pattern: "几点|\\d{1,2}点" });
    expect(entryTriggered(e, "现在几点了")).toBe(true);
    expect(entryTriggered(e, "hello")).toBe(false);
    expect(entryTriggered(entry({ title: "坏", content: "x", mode: "regex", pattern: "([bad" }), "x")).toBe(false);
  });
});

describe("collectWorldbookContext 汇总", () => {
  const book: Worldbook = {
    id: "b1",
    name: "设定集",
    entries: [
      entry({ title: "低优先", content: "低", keys: ["猫"] }),
      entry({ title: "高优先", content: "高", keys: ["猫"], priority: 10 }),
      entry({ title: "近对话", content: "近", keys: ["猫"], position: "context" }),
      entry({ title: "没命中", content: "无", keys: ["狗"] }),
    ],
    createdAt: 0,
  };

  it("按优先级降序、分 system/context 两组", () => {
    const ctx = collectWorldbookContext([book], "猫猫");
    expect(ctx.system).toBe("【高优先】\n高\n\n【低优先】\n低");
    expect(ctx.context).toBe("【近对话】\n近");
  });

  it("全部未命中时两组都为空串", () => {
    const ctx = collectWorldbookContext([book], "天气");
    expect(ctx.system).toBe("");
    expect(ctx.context).toBe("");
  });
});

describe("scanTextOf 扫描窗口", () => {
  it("只取最近 N 条消息拼接", () => {
    const history = [1, 2, 3, 4, 5].map((n) => ({ content: `m${n}` }));
    expect(scanTextOf(history, 2)).toBe("m4\nm5");
    expect(scanTextOf(history)).toBe("m1\nm2\nm3\nm4\nm5");
  });
});

describe("parseWorldbookJson 导入导出", () => {
  it("worldbookToJson → parseWorldbookJson roundtrip", () => {
    const book: Worldbook = {
      id: "b1",
      name: "城市设定",
      description: "背景",
      createdAt: 0,
      entries: [entry({ title: "城市", content: "临海小城", mode: "always" })],
    };
    const parsed = parseWorldbookJson(worldbookToJson(book));
    expect(parsed.name).toBe("城市设定");
    expect(parsed.description).toBe("背景");
    expect(parsed.entries[0]).toMatchObject({ title: "城市", mode: "always", priority: 0, enabled: true });
  });

  it("type 不对 / 坏 JSON 抛「世界书格式不正确」", () => {
    expect(() => parseWorldbookJson("{}")).toThrow("世界书格式不正确");
    expect(() => parseWorldbookJson("not json")).toThrow("世界书格式不正确");
    expect(() => parseWorldbookJson(JSON.stringify({ type: "other", entries: [] }))).toThrow("世界书格式不正确");
  });

  it("字段归一：keys 接受逗号串、priority 夹取、非法字段取默认", () => {
    const parsed = parseWorldbookJson(
      JSON.stringify({
        type: "purin.worldbook",
        name: "  ",
        entries: [{ title: "t", content: "c", keys: "a，b、c", priority: 999, mode: "bogus" }],
      }),
    );
    expect(parsed.name).toBe("导入的世界书");
    expect(parsed.entries[0]).toMatchObject({ keys: ["a", "b", "c"], priority: 100, mode: "keyword" });
  });
});

describe("parseWorldbookText 纯文本导入", () => {
  it("解析 @指令：常驻/关键词/优先级/位置，块间 --- 分隔", () => {
    const text = [
      "# 世界观",
      "@常驻",
      "魔法都市。",
      "---",
      "深夜食堂",
      "@关键词: 拉面, 关东煮",
      "@优先级: 5",
      "只在夜里开门。",
      "---",
      "考试周",
      "@正则: 考试|复习",
      "@位置: 近对话",
      "图书馆通宵。",
    ].join("\n");
    const parsed = parseWorldbookText(text);
    expect(parsed.name).toBe("导入的世界书");
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]).toMatchObject({ title: "世界观", mode: "always", priority: 0 });
    expect(parsed.entries[1]).toMatchObject({ title: "深夜食堂", keys: ["拉面", "关东煮"], priority: 5 });
    expect(parsed.entries[2]).toMatchObject({ mode: "regex", pattern: "考试|复习", position: "context" });
  });

  it("无关键词时用标题作触发词；空文本抛「世界书内容为空」", () => {
    const parsed = parseWorldbookText("下雨天\n出门要带伞。");
    expect(parsed.entries[0].keys).toEqual(["下雨天"]);
    expect(() => parseWorldbookText("   \n---\n  ")).toThrow("世界书内容为空");
  });
});
