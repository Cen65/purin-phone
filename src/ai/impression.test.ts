import { beforeEach, describe, expect, it } from "vitest";
import { buildImpressionMessages, mergeImpression, IMPRESSION_LIMIT } from "./impression";
import { registerProvider } from "./providers";
import { useSettingsStore } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";
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
