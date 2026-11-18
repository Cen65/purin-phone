import type { LLMMessage } from "./types";
import type { Moment } from "../state/momentsStore";
import { useMomentsStore } from "../state/momentsStore";
import { useCallStore } from "../state/callStore";
import { useSettingsStore, isApiReady } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { usePhoneStore } from "../state/phoneStore";
import { getProvider } from "./providers";
import { buildMomentMessages, buildCallMessages } from "./prompt";
import { bus } from "../core/events";

/**
 * 聊天之外的 AI 创作入口（P2）：
 * - generateMoment：让角色发一条朋友圈；
 * - callReply：模拟通话里对方说的一句话。
 * 都是非流式一次性调用，由调用方决定 UI 反馈。
 */

async function chatOnce(messages: LLMMessage[]): Promise<string> {
  const settings = useSettingsStore.getState();
  const provider = getProvider(settings.api.provider) ?? getProvider("openai-compatible");
  if (!provider) throw new Error("没有可用的 AI Provider");
  const result = await provider.chat({
    baseUrl: settings.api.baseUrl,
    apiKey: settings.api.apiKey,
    model: settings.api.model,
    messages,
  });
  return result.content.trim();
}

/** 让角色发一条朋友圈；未配置 API / 生成失败时返回 null（失败已通过 notify 提示） */
export async function generateMoment(characterId: string): Promise<Moment | null> {
  const character = useCharactersStore.getState().characters.find((c) => c.id === characterId);
  if (!character) return null;
  if (!isApiReady(useSettingsStore.getState().api)) {
    bus.emit("notify", {
      appId: "settings",
      title: "请先配置 AI 服务",
      body: "打开设置，填写 Base URL、API Key 和模型",
    });
    usePhoneStore.getState().openApp("settings");
    return null;
  }
  try {
    const text = (await chatOnce(buildMomentMessages(character, useSettingsStore.getState().persona))).slice(0, 200);
    if (!text) return null;
    const moment = useMomentsStore.getState().addMoment({
      authorId: character.id,
      authorName: character.name,
      authorAvatar: character.avatar,
      text,
    });
    bus.emit("moments:posted", { momentId: moment.id, authorName: character.name });
    bus.emit("notify", { appId: "moments", title: `${character.name} 发了动态`, body: text.slice(0, 60) });
    if (usePhoneStore.getState().activeAppId !== "moments") {
      usePhoneStore.getState().bumpBadge("moments");
    }
    return moment;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    bus.emit("notify", { kind: "error", title: "动态生成失败", body: message.slice(0, 80) });
    return null;
  }
}

/** 模拟通话：生成对方的一句话（口语超短句）。失败抛错，由通话界面提示。 */
export async function callReply(characterId: string): Promise<string> {
  const character = useCharactersStore.getState().characters.find((c) => c.id === characterId);
  if (!character) throw new Error("角色不存在");
  const settings = useSettingsStore.getState();
  if (!isApiReady(settings.api)) throw new Error("请先配置 AI 服务");

  const { lines } = useCallStore.getState();
  const reply = await chatOnce(
    buildCallMessages({ character, persona: settings.persona, history: lines }),
  );
  const cleaned = reply.replace(/^[「"“]|[」"”]$/g, "").trim();
  if (!cleaned) throw new Error("对方沉默了");
  return cleaned.slice(0, 60);
}
