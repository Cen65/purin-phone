import { beforeEach, describe, expect, it } from "vitest";
import {
  isSleeping,
  nextDueAt,
  pickDueCharacters,
  buildProactiveMessages,
  runProactiveRound,
} from "./proactive";
import { registerProvider } from "./providers";
import { useSettingsStore } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";
import { usePhoneStore } from "../state/phoneStore";
import { useProactiveStore } from "../state/proactiveStore";
import { bus } from "../core/events";
import type { ChatRequest, LLMProvider } from "./types";
import type { Character } from "../types";

let replier: (request: ChatRequest) => Promise<string> = async () => "在干嘛呢？";

const fakeProvider: LLMProvider = {
  id: "fake",
  label: "测试 Provider",
  chat: async (request) => ({ content: await replier(request) }),
};
registerProvider(fakeProvider);

const alice: Character = {
  id: "a",
  name: "爱丽丝",
  avatar: "🅰️",
  tagline: "理性的学姐",
  systemPrompt: "冷静",
  memory: "一起养了猫",
  createdAt: 0,
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

beforeEach(() => {
  replier = async () => "在干嘛呢？";
  useSettingsStore.setState({
    api: { provider: "fake", baseUrl: "http://fake/v1", apiKey: "k", model: "m" },
    persona: { nickname: "小明" },
  });
  useCharactersStore.setState({ characters: [alice] });
  useChatStore.setState({ messages: {}, generating: {} });
  usePhoneStore.setState({ activeAppId: null, params: {}, badges: {} });
  useProactiveStore.setState({ engineOn: true, gapMinutes: 120, checkMinutes: 10, lastAt: {} });
});

describe("作息判断", () => {
  it("跨午夜区间：23:00–07:00", () => {
    const char = { sleepFrom: "23:00", sleepTo: "07:00" };
    expect(isSleeping(char, new Date(2026, 10, 19, 23, 30))).toBe(true);
    expect(isSleeping(char, new Date(2026, 10, 19, 6, 59))).toBe(true);
    expect(isSleeping(char, new Date(2026, 10, 19, 7, 0))).toBe(false);
    expect(isSleeping(char, new Date(2026, 10, 19, 12, 0))).toBe(false);
  });

  it("同日区间与非法值", () => {
    expect(isSleeping({ sleepFrom: "13:00", sleepTo: "14:00" }, new Date(2026, 10, 19, 13, 30))).toBe(true);
    expect(isSleeping({ sleepFrom: "13:00", sleepTo: "14:00" }, new Date(2026, 10, 19, 14, 0))).toBe(false);
    expect(isSleeping({ sleepFrom: "bad", sleepTo: "07:00" }, new Date(2026, 10, 19, 23, 0))).toBe(false);
    expect(isSleeping({}, new Date(2026, 10, 19, 3, 0))).toBe(false);
  });
});

describe("到期计算", () => {
  it("从未发过：3~10 分钟内到期", () => {
    const now = 1_000_000;
    expect(nextDueAt(undefined, 120, () => 0, now)).toBe(now + 3 * MINUTE);
    expect(nextDueAt(undefined, 120, () => 0.999, now)).toBeGreaterThan(now + 9 * MINUTE);
  });

  it("发过：间隔 + 半间隔抖动", () => {
    const lastAt = 500_000;
    expect(nextDueAt(lastAt, 120, () => 0)).toBe(lastAt + 2 * HOUR);
    expect(nextDueAt(lastAt, 120, () => 1)).toBe(lastAt + 3 * HOUR);
  });
});

describe("挑选到期角色", () => {
  const base = { now: 1_000_000_000, rand: () => 0 };

  it("总开关关闭 / API 未配置 → 空列表", () => {
    expect(pickDueCharacters([alice], { ...base, engineOn: false, apiReady: true })).toEqual([]);
    expect(pickDueCharacters([alice], { ...base, engineOn: true, apiReady: false })).toEqual([]);
  });

  it("角色关闭主动消息 → 排除", () => {
    const off = { ...alice, proactiveEnabled: false };
    useProactiveStore.getState().touch(alice.id, 0);
    expect(pickDueCharacters([off], { ...base, apiReady: true, gapMinutes: 120 })).toEqual([]);
  });

  it("还没到间隔 / 用户刚聊过 / 睡眠中 → 排除", () => {
    useProactiveStore.getState().touch(alice.id, base.now - 30 * MINUTE); // 30 分钟前刚发过
    expect(pickDueCharacters([alice], { ...base, apiReady: true, gapMinutes: 120 })).toEqual([]);

    useProactiveStore.setState({ lastAt: {} });
    expect(
      pickDueCharacters([alice], {
        ...base,
        apiReady: true,
        gapMinutes: 120,
        lastUserAt: { a: base.now - 5 * MINUTE }, // 用户 5 分钟前说过话
      }),
    ).toEqual([]);

    const sleepy = { ...alice, sleepFrom: "00:00", sleepTo: "23:59" };
    expect(pickDueCharacters([sleepy], { ...base, apiReady: true, gapMinutes: 120 })).toEqual([]);
  });

  it("到期且无阻碍 → 命中", () => {
    useProactiveStore.getState().touch(alice.id, base.now - 3 * HOUR);
    const picked = pickDueCharacters([alice], { ...base, apiReady: true, gapMinutes: 120 });
    expect(picked.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("主动消息提示词", () => {
  it("包含角色、记忆与主动性指令", () => {
    const messages = buildProactiveMessages({
      character: alice,
      persona: { nickname: "小明" },
      history: [
        { id: "m1", role: "user", content: "早上好", createdAt: Date.now() - 5 * HOUR, status: "done" },
      ],
      now: Date.now(),
    });
    expect(messages[0]?.role).toBe("system");
    const system = messages[0]?.content ?? "";
    expect(system).toContain("爱丽丝");
    expect(system).toContain("理性的学姐");
    expect(system).toContain("一起养了猫");
    expect(system).toContain("只输出这一条消息本身");
    expect(system).toContain("小时");
  });
});

describe("执行一轮", () => {
  it("生成 → 写入会话 → 通知 + 角标，lastAt 更新", async () => {
    useProactiveStore.getState().touch(alice.id, Date.now() - 3 * HOUR);
    const events: { title?: string; body?: string }[] = [];
    const off = bus.on("notify", (e) => events.push({ title: e.title, body: e.body }));

    const sent = await runProactiveRound();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.characterId).toBe("a");
    const messages = useChatStore.getState().messages["a"] ?? [];
    expect(messages.at(-1)?.role).toBe("assistant");
    expect(messages.at(-1)?.content).toBe("在干嘛呢？");
    expect(events[0]?.title).toBe("爱丽丝");
    expect(usePhoneStore.getState().badges["chat"]).toBe(1);
    expect(useProactiveStore.getState().lastAt["a"]).toBeGreaterThan(0);
    off();
  });

  it("生成失败也退避：不写入消息但 lastAt 前移", async () => {
    useProactiveStore.getState().touch(alice.id, Date.now() - 3 * HOUR);
    replier = async () => {
      throw new Error("炸了");
    };
    const sent = await runProactiveRound();
    expect(sent).toEqual([]);
    expect(useChatStore.getState().messages["a"]).toBeUndefined();
    expect(useProactiveStore.getState().lastAt["a"]).toBeGreaterThan(0);
  });
});
