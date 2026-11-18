import type { Character } from "../types";
import { getProvider } from "./providers";
import { buildMessages, buildGroupMessages } from "./prompt";
import { useSettingsStore, isApiReady } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";
import { useGroupsStore, groupConversationId, livingMembers, type Group } from "../state/groupsStore";
import { usePhoneStore } from "../state/phoneStore";
import { bus } from "../core/events";

/**
 * 聊天执行器：把 UI（发送按钮）和 AI 层（provider.chat）串联起来。
 * UI 组件只调用 sendMessage / sendGroupMessage / regenerate / stopGeneration，
 * 不关心 provider 细节，也不管流式渲染。
 */

/** 每个会话同时最多一个进行中的请求（key = conversationId） */
const controllers = new Map<string, AbortController>();
/** stopGeneration 标记：群聊轮到下一位成员前检查，避免停止后继续抢话 */
const stopped = new Set<string>();

/** 停止某个会话的生成（保留已生成的半截内容） */
export function stopGeneration(conversationId: string): void {
  stopped.add(conversationId);
  controllers.get(conversationId)?.abort();
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError" || /abort/i.test(error.message);
  }
  return false;
}

function resolveCharacter(characterId: string): Character | undefined {
  return useCharactersStore.getState().characters.find((c) => c.id === characterId);
}

function requireApi(): boolean {
  const settings = useSettingsStore.getState();
  if (isApiReady(settings.api)) return true;
  bus.emit("notify", {
    appId: "settings",
    title: "请先配置 AI 服务",
    body: "打开设置，填写 Base URL、API Key 和模型",
  });
  usePhoneStore.getState().openApp("settings");
  return false;
}

async function runAssistant(characterId: string): Promise<void> {
  const chat = useChatStore.getState();
  if (chat.generating[characterId]) return;

  const character = resolveCharacter(characterId);
  if (!character) return;

  const settings = useSettingsStore.getState();
  const provider = getProvider(settings.api.provider) ?? getProvider("openai-compatible");
  if (!provider) {
    bus.emit("notify", { kind: "error", title: "没有可用的 AI Provider" });
    return;
  }

  const messages = buildMessages({
    character,
    persona: settings.persona,
    history: chat.messages[characterId] ?? [],
    windowSize: settings.windowSize,
  });

  const controller = new AbortController();
  controllers.set(characterId, controller);
  const messageId = chat.startAssistant(characterId);
  try {
    const result = await provider.chat({
      baseUrl: settings.api.baseUrl,
      apiKey: settings.api.apiKey,
      model: settings.api.model,
      messages,
      signal: controller.signal,
      onDelta: (delta) => useChatStore.getState().appendDelta(characterId, messageId, delta),
    });
    useChatStore.getState().finishAssistant(characterId, messageId);
    bus.emit("chat:reply-finished", { characterId, content: result.content });
    bus.emit("notify", {
      appId: "chat",
      title: character.name,
      body: result.content.slice(0, 60) || "回复完成",
    });
    if (usePhoneStore.getState().activeAppId !== "chat") {
      usePhoneStore.getState().bumpBadge("chat");
    }
  } catch (error) {
    if (isAbortError(error)) {
      // 用户主动停止：保留半截内容，静默收场
      useChatStore.getState().finishAssistant(characterId, messageId);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    useChatStore.getState().failAssistant(characterId, messageId, message);
    bus.emit("notify", { appId: "chat", kind: "error", title: "回复失败", body: message.slice(0, 80) });
  } finally {
    controllers.delete(characterId);
    stopped.delete(characterId);
  }
}

export async function sendMessage(characterId: string, text: string): Promise<void> {
  const content = text.trim();
  if (!content) return;
  if (!requireApi()) return;
  if (!resolveCharacter(characterId)) return;

  stopped.delete(characterId);
  useChatStore.getState().addUserMessage(characterId, content);
  await runAssistant(characterId);
}

/** 以最近一条用户消息为输入，重新生成一条 AI 回复（单聊） */
export async function regenerate(characterId: string): Promise<void> {
  const history = useChatStore.getState().messages[characterId] ?? [];
  const hasUserMessage = history.some((message) => message.role === "user");
  if (!hasUserMessage) return;
  await runAssistant(characterId);
}

/** 群聊里一位角色发言（失败不打断后面的成员） */
async function runGroupAssistant(group: Group, character: Character): Promise<void> {
  const conversationId = groupConversationId(group.id);
  const chat = useChatStore.getState();
  if (chat.generating[conversationId]) return;

  const settings = useSettingsStore.getState();
  const provider = getProvider(settings.api.provider) ?? getProvider("openai-compatible");
  if (!provider) return;

  const members = livingMembers(group, useCharactersStore.getState().characters);
  const messages = buildGroupMessages({
    character,
    group,
    members,
    persona: settings.persona,
    history: useChatStore.getState().messages[conversationId] ?? [],
    windowSize: settings.windowSize,
  });

  const controller = new AbortController();
  controllers.set(conversationId, controller);
  const messageId = chat.startAssistant(conversationId, character.id);
  try {
    const result = await provider.chat({
      baseUrl: settings.api.baseUrl,
      apiKey: settings.api.apiKey,
      model: settings.api.model,
      messages,
      signal: controller.signal,
      onDelta: (delta) => useChatStore.getState().appendDelta(conversationId, messageId, delta),
    });
    useChatStore.getState().finishAssistant(conversationId, messageId);
    bus.emit("chat:reply-finished", { characterId: character.id, content: result.content });
    if (usePhoneStore.getState().activeAppId !== "chat") {
      usePhoneStore.getState().bumpBadge("chat");
    }
  } catch (error) {
    if (isAbortError(error)) {
      useChatStore.getState().finishAssistant(conversationId, messageId);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    useChatStore.getState().failAssistant(conversationId, messageId, message);
    // 单个成员失败不拦着其他人说话，但给个提示
    bus.emit("notify", {
      appId: "chat",
      kind: "error",
      title: `${character.name} 回复失败`,
      body: message.slice(0, 80),
    });
  } finally {
    controllers.delete(conversationId);
  }
}

/** 群聊发送：用户消息落库后，成员按 memberIds 顺序依次回复 */
export async function sendGroupMessage(groupId: string, text: string): Promise<void> {
  const content = text.trim();
  if (!content) return;
  if (!requireApi()) return;

  const group = useGroupsStore.getState().groups.find((g) => g.id === groupId);
  if (!group) return;

  const members = livingMembers(group, useCharactersStore.getState().characters);
  if (members.length === 0) {
    bus.emit("notify", { kind: "error", title: "群里没有可用成员", body: "请先在通讯录添加角色" });
    return;
  }

  const conversationId = groupConversationId(groupId);
  stopped.delete(conversationId);
  useChatStore.getState().addUserMessage(conversationId, content);
  for (const member of members) {
    // 用户可能在轮到下一位前点了「停止」
    if (stopped.has(conversationId)) break;
    await runGroupAssistant(group, member);
  }
  stopped.delete(conversationId);
}
