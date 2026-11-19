import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildMessages, buildGroupMessages, humanToneRules } from "./prompt";
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

  it("印象档案注入系统提示词（角色视角看用户）", () => {
    const prompt = buildSystemPrompt(
      { ...character, impression: "- TA 是个夜猫子，嘴硬心软" },
      { nickname: "小明" },
    );
    expect(prompt).toContain("你对用户的印象");
    expect(prompt).toContain("TA 是个夜猫子");
    // 无印象时不出现该段落
    expect(buildSystemPrompt(character, { nickname: "小明" })).not.toContain("你对用户的印象");
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

describe("说话纪律（去 AI 味）", () => {
  it("默认注入反 AI 纪律：短句、禁 markdown、不承认是 AI、不用表情、无动作", () => {
    const rules = humanToneRules(character).join("\n");
    expect(rules).toContain("不是 AI 助手");
    expect(rules).toContain("禁止 markdown");
    expect(rules).toContain("不承认、不暗示自己是 AI");
    expect(rules).toContain("不超过 25 字");
    expect(rules).toContain("不用 emoji");
    expect(rules).toContain("不要动作描写");
  });

  it("风格开关生效：long 篇幅、表情开、（小动作）开", () => {
    const rules = humanToneRules({
      ...character,
      styleLength: "long",
      styleEmoticon: true,
      styleAction: true,
    }).join("\n");
    expect(rules).toContain("四五句");
    expect(rules).not.toContain("不超过 25 字");
    expect(rules).toContain("偶尔可以带一个 emoji");
    expect(rules).toContain("（括号小动作）");
  });

  it("单聊与群聊 system 都包含说话纪律", () => {
    const one = buildSystemPrompt(character, { nickname: "" });
    expect(one).toContain("说话纪律");
    const group = buildGroupMessages({
      character: { ...character, id: "a" },
      group: { name: "g" },
      members: [{ ...character, id: "a" }],
      persona: { nickname: "" },
      history: [],
    });
    expect(group[0]?.content).toContain("说话纪律");
  });
});

describe("世界书注入（P3）", () => {
  const history: ChatMessage[] = [
    { id: "1", role: "user", content: "吃拉面吗", createdAt: 1, status: "done" },
  ];

  it("system 段进主提示词、context 段插在最后一条 user 前", () => {
    const messages = buildMessages({
      character,
      persona: { nickname: "" },
      history,
      worldbook: { system: "【食堂】深夜营业", context: "【此刻】用户饿了" },
    });
    expect(messages[0]?.content).toContain("世界书设定");
    expect(messages[0]?.content).toContain("【食堂】深夜营业");
    expect(messages[1]?.role).toBe("system");
    expect(messages[1]?.content).toContain("（此刻的背景补充）");
    expect(messages[1]?.content).toContain("【此刻】用户饿了");
    expect(messages[2]).toEqual({ role: "user", content: "吃拉面吗" });
  });

  it("空世界书时消息结构与无参数一致", () => {
    const messages = buildMessages({
      character,
      persona: { nickname: "" },
      history,
      worldbook: { system: "", context: "" },
    });
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("对话示例注入 system；群聊同样支持世界书", () => {
    const alice: Character = { id: "a", name: "爱丽丝", avatar: "🅰", tagline: "", systemPrompt: "", exampleDialogue: "用户：在吗\n爱丽丝：嗯", createdAt: 0 };
    const messages = buildGroupMessages({
      character: alice,
      group: { name: "群" },
      members: [alice],
      persona: { nickname: "" },
      history,
      worldbook: { system: "【规则】夜晚安静", context: "" },
    });
    expect(messages[0]?.content).toContain("对话示例");
    expect(messages[0]?.content).toContain("在吗");
    expect(messages[0]?.content).toContain("【规则】夜晚安静");
    expect(messages[1]?.role).toBe("user"); // 无 context 段时不插入补充消息
  });
});
