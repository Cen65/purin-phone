import { describe, it, expect } from "vitest";
import { buildForgeMessages, parseForgeResult } from "./characterForge";

describe("buildForgeMessages", () => {
  it("问卷转成 bullet 列表，空项不出现", () => {
    const messages = buildForgeMessages({ gender: " 女 ", personality: "傲娇", notes: "" });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    const user = messages[1].content;
    expect(user).toContain("- 性别：女");
    expect(user).toContain("- 性格：傲娇");
    expect(user).not.toContain("年龄段");
    expect(user).not.toContain("补充设定");
  });

  it("全空问卷走自由发挥分支", () => {
    const user = buildForgeMessages({})[1].content;
    expect(user).toContain("自由发挥");
  });
});

describe("parseForgeResult", () => {
  it("解析纯 JSON 输出", () => {
    const draft = parseForgeResult(
      JSON.stringify({ name: "布丁", avatar: "🍮", tagline: "甜", systemPrompt: "设定", firstMessage: "嗨", memory: "m" }),
    );
    expect(draft).toMatchObject({ name: "布丁", avatar: "🍮", tagline: "甜", systemPrompt: "设定", firstMessage: "嗨", memory: "m" });
  });

  it("容错：剥掉围栏和前后闲话", () => {
    const raw = '好的，这是角色：\n```json\n{"name":"小绿","avatar":"🌱","tagline":"","systemPrompt":"s"}\n```\n希望你喜欢';
    const draft = parseForgeResult(raw);
    expect(draft.name).toBe("小绿");
    expect(draft.tagline).toBe("");
    expect(draft.firstMessage).toBeUndefined();
  });

  it("无名字 / 非 JSON 抛错", () => {
    expect(() => parseForgeResult('{"avatar":"🍮"}')).toThrow("生成结果缺少名字");
    expect(() => parseForgeResult("完全不是 JSON")).toThrow("生成结果无法解析");
  });
});
