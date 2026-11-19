import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore, type ChatMessage } from "../state/chatStore";
import { useSettingsStore } from "../state/settingsStore";
import { registerProvider } from "./providers";
import type { LLMProvider, ChatRequest, ChatResult } from "./types";
import {
  AUTO_MEMORY_THRESHOLD,
  buildMemoryMessages,
  capMemory,
  maybeAutoConsolidate,
  messagesAfterCursor,
  MEMORY_LIMIT,
} from "./memory";
import type { Character } from "../types";

/* ---------- P3：合并提示词与截断 ---------- */

const manualCharacter: Character = {
  id: "c1",
  name: "小绿",
  avatar: "🌱",
  tagline: "",
  systemPrompt: "",
  memory: "- 用户喜欢猫",
  createdAt: 0,
};

function message(role: "user" | "assistant", content: string): ChatMessage {
  return { id: `${role}-${content}`, role, content, createdAt: 0, status: "done" };
}

describe("buildMemoryMessages", () => {
  it("现有记忆 + 最近对话进入 prompt，用户昵称参与转写", () => {
    const messages = buildMemoryMessages({
      character: manualCharacter,
      persona: { nickname: "阿明" },
      history: [message("user", "我养了只猫"), message("assistant", "真的吗")],
    });
    expect(messages).toHaveLength(2);
    const user = messages[1].content;
    expect(user).toContain("- 用户喜欢猫");
    expect(user).toContain("阿明：我养了只猫");
    expect(user).toContain("小绿：真的吗");
  });

  it("记忆为空时显示（空）占位", () => {
    const user = buildMemoryMessages({
      character: { ...manualCharacter, memory: "" },
      persona: { nickname: "" },
      history: [],
    })[1].content;
    expect(user).toContain("（空）");
    expect(user).toContain("角色名：小绿");
  });
});

describe("capMemory", () => {
  it("超长按行截断、不超长原样", () => {
    const short = capMemory("- a\n- b", 100);
    expect(short).toBe("- a\n- b");

    const long = Array.from({ length: 100 }, (_, i) => `- 记忆条目第${i}号`).join("\n");
    const capped = capMemory(long, MEMORY_LIMIT);
    expect(capped.length).toBeLessThanOrEqual(MEMORY_LIMIT);
    expect(capped.endsWith("号")).toBe(true); // 保留完整行
  });

  it("单行超长的兜底硬切", () => {
    const single = "x".repeat(3000);
    expect(capMemory(single).length).toBe(MEMORY_LIMIT);
  });
});

/* ---------- P4.5：自动巩固 ---------- */
/**
 * 自动巩固是「后台静默」行为：不抛错、不落 UI 提示，
 * 条件满足才调 AI 并把合并结果写回角色的 memory + memoryCursor。
 * 这里用假 Provider 端到端驱动（不发网络请求）。
 */

const baseProvider: LLMProvider = {
  id: "fake",
  label: "假服务",
  chat: async (request: ChatRequest): Promise<ChatResult> => {
    const user = request.messages.at(-1)?.content ?? "";
    return { content: `- 自动巩固结果（${user.includes("爱丽丝") ? "爱丽丝" : "未知"}）` };
  },
};

function seedMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `消息 ${index}`,
    createdAt: 0,
    status: "done" as const,
  }));
}

function resetStores() {
  useSettingsStore.setState({
    api: { provider: "fake", baseUrl: "https://fake.example/v1", apiKey: "k", model: "fake-model" },
    persona: { nickname: "" },
    memoryAuto: true,
  });
  useCharactersStore.setState({ characters: [] });
  useChatStore.setState({ messages: {}, generating: {} });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetStores();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messagesAfterCursor 游标", () => {
  it("无游标 = 全部都是新消息；游标命中 = 其后为新消息", () => {
    const messages = seedMessages(5);
    expect(messagesAfterCursor(messages)).toHaveLength(5);
    expect(messagesAfterCursor(messages, "m2").map((m) => m.id)).toEqual(["m3", "m4"]);
  });

  it("游标丢失（清空过会话后旧 id 不在）视为全部新消息", () => {
    const messages = seedMessages(3);
    expect(messagesAfterCursor(messages, "gone")).toHaveLength(3);
  });
});

describe("maybeAutoConsolidate 自动巩固", () => {
  // 模块级冷却（AUTO_MEMORY_COOLDOWN_MS）按角色 id 记账，各用例用独立 id 互不串扰。
  const alice = (id: string, extra?: Partial<Character>): Character => ({
    id,
    name: "爱丽丝",
    avatar: "🎀",
    tagline: "",
    systemPrompt: "",
    createdAt: 0,
    ...extra,
  });

  it("新消息不足阈值时不调 AI、不写记忆", async () => {
    registerProvider(baseProvider);
    useCharactersStore.setState({ characters: [alice("alice-short", { memoryCursor: "m0" })] });
    useChatStore.setState({ messages: { "alice-short": seedMessages(10) } });
    const chat = vi.spyOn(baseProvider, "chat");

    await maybeAutoConsolidate("alice-short");
    expect(chat).not.toHaveBeenCalled();
    expect(useCharactersStore.getState().characters[0].memory).toBeUndefined();
  });

  it("达到阈值：合并落库并推进游标到最新消息", async () => {
    registerProvider(baseProvider);
    useCharactersStore.setState({ characters: [alice("alice-full")] });
    const messages = seedMessages(AUTO_MEMORY_THRESHOLD + 2);
    useChatStore.setState({ messages: { "alice-full": messages } });

    await maybeAutoConsolidate("alice-full");
    const character = useCharactersStore.getState().characters[0];
    expect(character.memory).toContain("自动巩固结果");
    expect(character.memoryCursor).toBe(messages.at(-1)?.id);
  });

  it("总开关关闭时跳过", async () => {
    registerProvider(baseProvider);
    useSettingsStore.setState({ memoryAuto: false });
    useCharactersStore.setState({ characters: [alice("alice-off")] });
    useChatStore.setState({ messages: { "alice-off": seedMessages(AUTO_MEMORY_THRESHOLD + 2) } });
    const chat = vi.spyOn(baseProvider, "chat");

    await maybeAutoConsolidate("alice-off");
    expect(chat).not.toHaveBeenCalled();
    expect(useCharactersStore.getState().characters[0].memory).toBeUndefined();
  });

  it("游标已推进后，旧消息不再重复巩固", async () => {
    registerProvider(baseProvider);
    const messages = seedMessages(AUTO_MEMORY_THRESHOLD + 2);
    useCharactersStore.setState({
      characters: [alice("alice-done", { memoryCursor: messages.at(-1)?.id })],
    });
    useChatStore.setState({ messages: { "alice-done": messages } });
    const chat = vi.spyOn(baseProvider, "chat");

    await maybeAutoConsolidate("alice-done");
    expect(chat).not.toHaveBeenCalled();
  });

  it("AI 失败时静默（不抛错）、不写记忆", async () => {
    const failing: LLMProvider = {
      ...baseProvider,
      chat: async () => {
        throw new Error("boom");
      },
    };
    registerProvider(failing);
    useCharactersStore.setState({ characters: [alice("alice-fail")] });
    useChatStore.setState({ messages: { "alice-fail": seedMessages(AUTO_MEMORY_THRESHOLD + 2) } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(maybeAutoConsolidate("alice-fail")).resolves.toBeUndefined();
    expect(useCharactersStore.getState().characters[0].memory).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
