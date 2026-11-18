import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildMessages, buildGroupMessages } from "./prompt";
import type { Character } from "../types";
import type { ChatMessage } from "../state/chatStore";

const character: Character = {
  id: "c1",
  name: "阿茶",
  avatar: "🍵",
  tagline: "安静的猫咖店主",
  systemPrompt: "说话简洁，喜欢猫。",
  createdAt: 0,
};

describe("buildSystemPrompt", () => {
  it("包含角色名、简介、设定与用户昵称", () => {
    const prompt = buildSystemPrompt(character, { nickname: "小明" });
    expect(prompt).toContain("阿茶");
    expect(prompt).toContain("猫咖店主");
    expect(prompt).toContain("说话简洁，喜欢猫。");
    expect(prompt).toContain("小明");
  });

  it("昵称为空时使用默认称呼", () => {
    const prompt = buildSystemPrompt(character, { nickname: "" });
    expect(prompt).toContain("用户");
  });
});

describe("buildMessages", () => {
  it("首条为 system，其后按窗口截取历史", () => {
    const history: ChatMessage[] = Array.from({ length: 30 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `msg-${index}`,
      createdAt: index,
      status: "done" as const,
    }));
    const messages = buildMessages({
      character,
      persona: { nickname: "小明" },
      history,
      windowSize: 6,
    });
    expect(messages[0]?.role).toBe("system");
    const rest = messages.slice(1);
    expect(rest).toHaveLength(6);
    expect(rest[0]?.content).toBe("msg-24");
    expect(rest[5]?.content).toBe("msg-29");
  });

  it("过滤空内容消息（如失败的占位回复）", () => {
    const history: ChatMessage[] = [
      { id: "a", role: "user", content: "hi", createdAt: 1, status: "done" },
      { id: "b", role: "assistant", content: "", createdAt: 2, status: "error", error: "boom" },
    ];
    const messages = buildMessages({ character, persona: { nickname: "" }, history });
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
  });
});

describe("buildSystemPrompt 记忆注入（P1）", () => {
  it("有 memory 时注入长期记忆段", () => {
    const prompt = buildSystemPrompt({ ...character, memory: "用户喜欢深夜聊天" }, { nickname: "" });
    expect(prompt).toContain("长期记忆");
    expect(prompt).toContain("用户喜欢深夜聊天");
  });

  it("无 memory 时不出现记忆段", () => {
    const prompt = buildSystemPrompt(character, { nickname: "" });
    expect(prompt).not.toContain("长期记忆");
  });
});

describe("buildGroupMessages 群聊映射（P1）", () => {
  const alice: Character = { id: "a", name: "爱丽丝", avatar: "🅰", tagline: "", systemPrompt: "理性", createdAt: 0 };
  const bob: Character = { id: "b", name: "鲍勃", avatar: "🅱", tagline: "", systemPrompt: "热情", createdAt: 0 };
  const members = [alice, bob];

  it("自己说的 → assistant；其他成员和用户的话 → user 且带名字前缀", () => {
    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "大家好", createdAt: 1, status: "done" },
      { id: "2", role: "assistant", content: "你好呀", createdAt: 2, status: "done", speakerId: alice.id },
      { id: "3", role: "assistant", content: "yo", createdAt: 3, status: "done", speakerId: bob.id },
    ];
    const messages = buildGroupMessages({
      character: alice,
      group: { name: "老友群" },
      members,
      persona: { nickname: "小明" },
      history,
    });
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("老友群");
    expect(messages[0]?.content).toContain("鲍勃"); // 其他成员名字进 system
    expect(messages[1]).toEqual({ role: "user", content: "小明：大家好" });
    expect(messages[2]).toEqual({ role: "assistant", content: "你好呀" });
    expect(messages[3]).toEqual({ role: "user", content: "鲍勃：yo" });
  });

  it("用户昵称为空时用「我」作前缀", () => {
    const messages = buildGroupMessages({
      character: alice,
      group: { name: "g" },
      members,
      persona: { nickname: "" },
      history: [{ id: "1", role: "user", content: "hi", createdAt: 1, status: "done" }],
    });
    expect(messages[1]?.content).toBe("我：hi");
  });
});
