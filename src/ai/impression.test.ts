import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildImpressionMessages, mergeImpression, maybeAutoImpression, IMPRESSION_LIMIT, IMPRESSION_THRESHOLD } from "./impression";
import { registerProvider } from "./providers";
import { useSettingsStore } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore, type ChatMessage } from "../state/chatStore";
import type { ChatRequest, LLMProvider } from "./types";
import type { Character } from "../types";

let replier: (request: ChatRequest) => Promise<string> = async () => "- TA 很爱笑";

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
  systemPrompt: "",
  createdAt: 0,
};

beforeEach(() => {
  replier = async () => "- TA 很爱笑";
  useSettingsStore.setState({
    api: { provider: "fake", baseUrl: "http://fake/v1", apiKey: "k", model: "m" },
    persona: { nickname: "小明" },
    impressionAuto: true,
  });
  useCharactersStore.setState({ characters: [alice] });
  useChatStore.setState({
    messages: {
      a: [
        { id: "m0", role: "user", content: "我今天加班到十点", createdAt: 1, status: "done" },
        { id: "m1", role: "assistant", content: "辛苦了，吃晚饭了吗", createdAt: 2, status: "done" },
      ],
    },
  });
});

describe("buildImpressionMessages", () => {
  it("以角色视角描述用户：含角色名、现有印象、对话转写", () => {
    const messages = buildImpressionMessages({
      character: { ...alice, impression: "- TA 有点工作狂" },
      persona: { nickname: "小明" },
      history: useChatStore.getState().messages.a ?? [],
    });
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("爱丽丝");
    expect(messages[0]?.content).toContain("印象档案");
    expect(messages[1]?.content).toContain("TA 有点工作狂");
    expect(messages[1]?.content).toContain("小明：我今天加班到十点");
    expect(messages[1]?.content).toContain("爱丽丝：辛苦了");
  });

  it("现有印象为空时用（空）占位", () => {
    const messages = buildImpressionMessages({
      character: alice,
      persona: { nickname: "小明" },
      history: [],
    });
    expect(messages[1]?.content).toContain("（空）");
  });
});

describe("mergeImpression", () => {
  it("返回 AI 结果且不落库（保存权在 UI）", async () => {
    const draft = await mergeImpression("a");
    expect(draft).toBe("- TA 很爱笑");
    expect(useCharactersStore.getState().characters[0].impression).toBeUndefined();
  });

  it("超长结果截断到 IMPRESSION_LIMIT", async () => {
    replier = async () => "- " + "很".repeat(2000);
    const draft = await mergeImpression("a");
    expect(draft.length).toBeLessThanOrEqual(IMPRESSION_LIMIT);
  });

  it("角色不存在 / API 未配置时抛错", async () => {
    await expect(mergeImpression("nope")).rejects.toThrow("角色不存在");
    useSettingsStore.setState({ api: { provider: "fake", baseUrl: "", apiKey: "", model: "" } });
    await expect(mergeImpression("a")).rejects.toThrow("请先配置 AI 服务");
  });
});

/* ---------- 印象自动巩固（与记忆同款节奏，阈值更疏） ---------- */

function seed(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `消息 ${index}`,
    createdAt: 0,
    status: "done" as const,
  }));
}

describe("maybeAutoImpression 印象自动巩固", () => {
  // 模块级冷却按角色 id 记账，各用例独立 id 互不串扰
  const character = (id: string, extra?: Partial<Character>): Character => ({
    ...alice,
    id,
    ...extra,
  });

  // 共享 fakeProvider 上的 spy 会累积跨用例调用，先清空再断言
  beforeEach(() => {
    vi.spyOn(fakeProvider, "chat").mockClear();
  });

  it("新消息不足阈值（24）不调 AI、不写印象", async () => {
    useCharactersStore.setState({ characters: [character("imp-short", { impressionCursor: "m0" })] });
    useChatStore.setState({ messages: { "imp-short": seed(20) } }); // 游标后 19 条 < 24
    const chat = vi.spyOn(fakeProvider, "chat");
    await maybeAutoImpression("imp-short");
    expect(chat).not.toHaveBeenCalled();
    expect(useCharactersStore.getState().characters[0]?.impression).toBeUndefined();
  });

  it("达到阈值：合并落库并推进游标", async () => {
    useCharactersStore.setState({
      characters: [character("imp-full", { impression: "- 旧印象", impressionCursor: "m0" })],
    });
    useChatStore.setState({ messages: { "imp-full": seed(26) } }); // 游标后 25 条 >= 24
    const chat = vi.spyOn(fakeProvider, "chat");
    await maybeAutoImpression("imp-full");
    expect(chat).toHaveBeenCalledTimes(1);
    const updated = useCharactersStore.getState().characters[0];
    expect(updated?.impression).toBe("- TA 很爱笑");
    expect(updated?.impressionCursor).toBe("m25");
    // prompt 里带旧印象 + 新对话转写
    const user = chat.mock.calls[0]?.[0].messages.at(-1)?.content ?? "";
    expect(user).toContain("- 旧印象");
    expect(user).toContain("消息 20");
  });

  it("总开关关闭时跳过（不调 AI）", async () => {
    useSettingsStore.setState({ impressionAuto: false });
    useCharactersStore.setState({ characters: [character("imp-off")] });
    useChatStore.setState({ messages: { "imp-off": seed(30) } });
    const chat = vi.spyOn(fakeProvider, "chat");
    await maybeAutoImpression("imp-off");
    expect(chat).not.toHaveBeenCalled();
  });

  it("游标已推进则不重复巩固；AI 失败静默且不落库", async () => {
    useCharactersStore.setState({
      characters: [character("imp-done", { impression: "- TA 很爱笑", impressionCursor: "m29" })],
    });
    useChatStore.setState({ messages: { "imp-done": seed(30) } }); // 游标后 0 条
    const chat = vi.spyOn(fakeProvider, "chat");
    await maybeAutoImpression("imp-done");
    expect(chat).not.toHaveBeenCalled();

    // 失败轮：warn 但不抛错、不改字段（游标不推进，下次还会试）
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useCharactersStore.setState({ characters: [character("imp-fail", { impressionCursor: "m0" })] });
    useChatStore.setState({ messages: { "imp-fail": seed(30) } });
    replier = async () => {
      throw new Error("炸了");
    };
    await expect(maybeAutoImpression("imp-fail")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(useCharactersStore.getState().characters[1]?.impression).toBeUndefined();
    expect(IMPRESSION_THRESHOLD).toBe(24);
  });
});
