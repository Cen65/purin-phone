import type { Character } from "../types";
import { getProvider } from "./providers";
import { buildMessages, buildGroupMessages } from "./prompt";
import { useSettingsStore, isApiReady } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";
import { useGroupsStore, groupConversationId, livingMembers, type Group } from "../state/groupsStore";
import { useWorldbookStore } from "../state/worldbookStore";
import { collectWorldbookContext, scanTextOf, type WorldbookContext } from "../core/worldbook";
import { usePhoneStore } from "../state/phoneStore";
import { bus } from "../core/events";
import { saveImage } from "../core/imageStore";
import { maybeAutoConsolidate } from "./memory";
import { pickSpeakers } from "./groupStrategy";

/**
 * 聊天执行器：把 UI（发送按钮）和 AI 层（provider.chat）串联起来。
 * UI 组件只调用 sendMessage / sendGroupMessage / regenerate / stopGeneration，
 * 不关心 provider 细节，也不管流式渲染。
 */

/** /画 指令前缀（P4 生图） */
const IMAGE_COMMAND = "/画 ";

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

/** 多路世界书绑定（角色自带 + 群自带）取并集，按最近消息算触发 */
function worldbookContextFor(
  bookIdLists: (string[] | undefined)[],
  history: { content: string }[],
): WorldbookContext {
  const ids = new Set<string>();
  for (const list of bookIdLists) {
    for (const id of list ?? []) ids.add(id);
  }
  if (ids.size === 0) return { system: "", context: "" };
  const books = useWorldbookStore.getState().books.filter((book) => ids.has(book.id));
  return collectWorldbookContext(books, scanTextOf(history));
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
    worldbook: worldbookContextFor([character.worldbookIds], chat.messages[characterId] ?? []),
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
    // 记忆自动巩固：后台检查，条件不满足直接返回（见 ai/memory.ts）
    void maybeAutoConsolidate(characterId);
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

  // P4 生图：/画 一只在月光下打盹的猫 → 生成图片消息而不是文字回复
  if (content.startsWith(IMAGE_COMMAND)) {
    await runImageGeneration(characterId, content.slice(IMAGE_COMMAND.length).trim());
    return;
  }
  await runAssistant(characterId);
}

/** 单聊：调用生图接口，把结果落进 IndexedDB 并在会话里展示 */
async function runImageGeneration(conversationId: string, prompt: string): Promise<void> {
  const chat = useChatStore.getState();
  const settings = useSettingsStore.getState();
  if (!prompt) {
    bus.emit("notify", { kind: "error", title: "画画指令缺了描述", body: "试试：/画 一只戴围巾的柴犬" });
    return;
  }
  if (chat.generating[conversationId]) return;
  if (!settings.imageModel.trim()) {
    bus.emit("notify", {
      appId: "settings",
      kind: "error",
      title: "还没有配置生图模型",
      body: "打开设置，在 AI 服务里填写生图模型（如 Kwai-Kolors）",
    });
    usePhoneStore.getState().openApp("settings");
    return;
  }
  const provider = getProvider(settings.api.provider) ?? getProvider("openai-compatible");
  if (!provider?.generateImage) {
    bus.emit("notify", { kind: "error", title: "当前 Provider 不支持生图" });
    return;
  }

  const controller = new AbortController();
  controllers.set(conversationId, controller);
  const messageId = chat.startAssistant(conversationId, undefined, "image");
  // content 存提示词，供 UI 展示与重试
  useChatStore.getState().appendDelta(conversationId, messageId, prompt);
  try {
    const result = await provider.generateImage({
      baseUrl: settings.api.baseUrl,
      apiKey: settings.api.apiKey,
      model: settings.imageModel.trim(),
      prompt,
    });
    const imageId = await saveImage(result.dataUrl);
    useChatStore.getState().setImageResult(conversationId, messageId, imageId);
    bus.emit("notify", { appId: "chat", title: "图片已生成", body: prompt.slice(0, 60) });
  } catch (error) {
    if (isAbortError(error)) {
      useChatStore.getState().finishAssistant(conversationId, messageId);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    useChatStore.getState().failAssistant(conversationId, messageId, message);
    bus.emit("notify", { kind: "error", title: "生图失败", body: message.slice(0, 80) });
  } finally {
    controllers.delete(conversationId);
    stopped.delete(conversationId);
  }
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
  const history = useChatStore.getState().messages[conversationId] ?? [];
  const messages = buildGroupMessages({
    character,
    group,
    members,
    persona: settings.persona,
    history,
    windowSize: settings.windowSize,
    worldbook: worldbookContextFor(
      [group.worldbookIds, ...members.map((member) => member.worldbookIds)],
      history,
    ),
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

/** 群聊发送：用户消息落库后，按群的抢答策略挑人回复（全员按序 / 随机 / 话痨加权） */
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
  for (const member of pickSpeakers(members, group.replyMode)) {
    // 用户可能在轮到下一位前点了「停止」
    if (stopped.has(conversationId)) break;
    await runGroupAssistant(group, member);
  }
  stopped.delete(conversationId);
}
