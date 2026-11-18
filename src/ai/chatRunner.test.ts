import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "./providers";
import { sendMessage, sendGroupMessage, stopGeneration } from "./chatRunner";
import { useSettingsStore } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useGroupsStore, groupConversationId } from "../state/groupsStore";
import { useChatStore } from "../state/chatStore";
import { usePhoneStore } from "../state/phoneStore";
import type { ChatRequest, LLMProvider } from "./types";
import type { Character, } from "../types";

/** 测试桩：注册一个完全可控的 fake provider。 */
let replier: (request: ChatRequest) => Promise<string> = async () => "ok";

const fakeProvider: LLMProvider = {
  id: "fake",
  label: "测试 Provider",
  chat: async (request) => {
    const content = await replier(request);
    request.onDelta?.(content);
    return { content };
  },
};
registerProvider(fakeProvider);

const alice: Character = { id: "a", name: "爱丽丝", avatar: "🅰️", tagline: "", systemPrompt: "理性", createdAt: 0 };
const bob: Character = { id: "b", name: "鲍勃", avatar: "🅱️", tagline: "", systemPrompt: "热情", createdAt: 0 };
const GROUP_ID = "g1";
const CONV = groupConversationId(GROUP_ID);

beforeEach(() => {
  replier = async () => "ok";
  useSettingsStore.setState({
    api: { provider: "fake", baseUrl: "http://fake/v1", apiKey: "k", model: "m" },
    persona: { nickname: "小明" },
    windowSize: 20,
  });
  useCharactersStore.setState({ characters: [alice, bob] });
  useGroupsStore.setState({ groups: [{ id: GROUP_ID, name: "老友群", memberIds: [alice.id, bob.id], createdAt: 0 }] });
  useChatStore.setState({ messages: {}, generating: {} });
  usePhoneStore.setState({ activeAppId: "chat", params: {}, badges: {} });
});

/** 群聊执行（P1）：顺序发言、fail-soft、停止。 */
describe("sendGroupMessage", () => {
  it("成员按顺序依次发言，消息带 speakerId", async () => {
    replier = async (request) => (request.messages[0]?.content.includes("扮演「爱丽丝」") ? "A 的话" : "B 的话");
    await sendGroupMessage(GROUP_ID, "大家好");
    const messages = useChatStore.getState().messages[CONV] ?? [];
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "assistant"]);
    expect(messages[1]).toMatchObject({ speakerId: "a", content: "A 的话", status: "done" });
    expect(messages[2]).toMatchObject({ speakerId: "b", content: "B 的话", status: "done" });
    expect(useChatStore.getState().generating[CONV]).toBe(false);
  });

  it("单个成员失败不打断后面的成员（fail-soft）", async () => {
    replier = async (request) => {
      if (request.messages[0]?.content.includes("扮演「爱丽丝」")) throw new Error("network down");
      return "B 的话";
    };
    await sendGroupMessage(GROUP_ID, "在吗");
    const messages = useChatStore.getState().messages[CONV] ?? [];
    expect(messages[1]).toMatchObject({ speakerId: "a", status: "error", error: "network down" });
    expect(messages[2]).toMatchObject({ speakerId: "b", status: "done", content: "B 的话" });
  });

  it("生成中点停止：轮到的下一位成员不再发言", async () => {
    replier = async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (request.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return "迟到的话";
    };
    const pending = sendGroupMessage(GROUP_ID, "大家好");
    await new Promise((resolve) => setTimeout(resolve, 5));
    stopGeneration(CONV);
    await pending;
    const messages = useChatStore.getState().messages[CONV] ?? [];
    expect(messages.some((message) => message.speakerId === "b")).toBe(false);
    // 被中断的 A 保留半截（内容为空）但不算失败
    expect(messages[1]).toMatchObject({ speakerId: "a", status: "done" });
  });
});

/** 单聊停止（P1）：保留半截内容。 */
describe("sendMessage 停止生成", () => {
  it("中止后已流出的半截内容保留且状态为 done", async () => {
    replier = async (request) => {
      request.onDelta?.("你");
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (request.signal?.aborted) throw new Error("This operation was aborted");
      return "好呀";
    };
    const pending = sendMessage(alice.id, "在吗");
    await new Promise((resolve) => setTimeout(resolve, 5));
    stopGeneration(alice.id);
    await pending;
    const messages = useChatStore.getState().messages[alice.id] ?? [];
    const last = messages[messages.length - 1];
    expect(last).toMatchObject({ role: "assistant", status: "done", content: "你" });
  });
});

describe("未配置 API 时的守卫", () => {
  it("不发消息并跳转设置", async () => {
    useSettingsStore.setState({ api: { provider: "fake", baseUrl: "", apiKey: "", model: "" } });
    await sendGroupMessage(GROUP_ID, "大家好");
    expect(useChatStore.getState().messages[CONV]).toBeUndefined();
    expect(usePhoneStore.getState().activeAppId).toBe("settings");
  });
});
