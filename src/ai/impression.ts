import type { LLMMessage } from "./types";
import type { Character } from "../types";
import type { PersonaSettings } from "../state/settingsStore";
import type { ChatMessage } from "../state/chatStore";
import { chatOnce } from "./creative";
import { useSettingsStore, isApiReady } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";
import { MEMORY_WINDOW, capMemory } from "./memory";

/**
 * 印象档案（功能池调研落地）：角色视角对用户的印象。
 * 与 memory（双方经历的事实记录）互补——impression 是角色"怎么看用户"：
 * 性格、喜好、习惯、情绪状态、关系远近。注入系统 Prompt 后影响角色的态度和亲疏。
 * 同 memory 一样：生成草稿 → 用户过目可编辑 → 保存（最终决定权在人）。
 */

/** 印象档案文本上限（字符），比记忆短——印象要凝练 */
export const IMPRESSION_LIMIT = 600;

export interface ImpressionInput {
  character: Character;
  persona: PersonaSettings;
  history: ChatMessage[];
}

export function buildImpressionMessages(input: ImpressionInput): LLMMessage[] {
  const { character, persona, history } = input;
  const me = persona.nickname.trim() || "我";
  const transcript = history
    .slice(-MEMORY_WINDOW)
    .map((message) => `${message.role === "user" ? me : character.name}：${message.content}`)
    .join("\n");

  const system = [
    `你是「${character.name}」。现在跳出对话，以你的视角写一份对「${me}」的印象档案。`,
    "记录：TA 的性格特点、喜好厌恶、说话习惯、最近的情绪状态、你们关系的远近变化。",
    "用第三人称称呼 TA（「TA」即可，不用写名字）；写你的主观看法，可以带感情色彩。",
    "输出格式：每条一行、以「- 」开头，总共 200 字以内；只输出档案本身，不要解释。",
  ].join("\n");
  const user = [
    `现有印象（可能为空，合并时保留仍然成立的部分，过时的可以改写）：\n${character.impression?.trim() || "（空）"}`,
    `最近对话：\n${transcript || "（空）"}`,
    "请输出合并后的印象档案。",
  ].join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 生成并返回印象档案草稿（不落库——由 UI 弹窗让用户确认后再保存）。
 * 失败抛错，由调用方提示。
 */
export async function mergeImpression(characterId: string): Promise<string> {
  const character = useCharactersStore.getState().characters.find((c) => c.id === characterId);
  if (!character) throw new Error("角色不存在");
  const settings = useSettingsStore.getState();
  if (!isApiReady(settings.api)) throw new Error("请先配置 AI 服务");

  const history = useChatStore.getState().messages[characterId] ?? [];
  const merged = await chatOnce(
    buildImpressionMessages({ character, persona: settings.persona, history }),
  );
  return capMemory(merged, IMPRESSION_LIMIT);
}

/* ===================== 自动巩固（与记忆同款节奏，更疏） ===================== */

/** 游标后攒够多少条新消息才刷新一次印象 */
export const IMPRESSION_THRESHOLD = 24;
/** 两轮自动巩固之间的最小间隔 */
export const IMPRESSION_COOLDOWN_MS = 30 * 60_000;

const inflightImpression = new Set<string>();
const lastImpressionAttempt = new Map<string, number>();

/** 游标之后的消息（游标丢失 = 视为全部新） */
function messagesAfterCursor(messages: ChatMessage[], cursor?: string): ChatMessage[] {
  if (!cursor) return messages;
  const index = messages.findIndex((message) => message.id === cursor);
  return index < 0 ? messages : messages.slice(index + 1);
}

/**
 * 印象档案自动巩固：回复完成后 fire-and-forget 调用。
 * 与手动 👁 共用 mergeImpression 的合并语义；这里直接落库并推进游标。
 * 阈值比记忆（12 条）高一倍、冷却更长——印象变得慢，别打扰模型。
 */
export async function maybeAutoImpression(characterId: string): Promise<void> {
  const character = useCharactersStore.getState().characters.find((c) => c.id === characterId);
  if (!character) return;
  const settings = useSettingsStore.getState();
  if (settings.impressionAuto === false) return;
  if (!isApiReady(settings.api)) return;
  if (inflightImpression.has(characterId)) return;
  const now = Date.now();
  const last = lastImpressionAttempt.get(characterId) ?? 0;
  if (now - last < IMPRESSION_COOLDOWN_MS) return;

  const messages = useChatStore.getState().messages[characterId] ?? [];
  const segment = messagesAfterCursor(messages, character.impressionCursor).filter((m) => m.content.trim());
  if (segment.length < IMPRESSION_THRESHOLD) return;

  inflightImpression.add(characterId);
  lastImpressionAttempt.set(characterId, now);
  try {
    const merged = await chatOnce(
      buildImpressionMessages({
        character,
        persona: settings.persona,
        // 已有印象 + 游标后的新对话（旧印象本身在 prompt 里，不需要全量历史）
        history: segment,
      }),
    );
    const impression = capMemory(merged, IMPRESSION_LIMIT);
    if (impression.trim()) {
      useCharactersStore
        .getState()
        .updateCharacter(characterId, { impression, impressionCursor: segment.at(-1)?.id });
    }
  } catch (error) {
    console.warn("[impression] 自动巩固失败，稍后会再试", error);
  } finally {
    inflightImpression.delete(characterId);
  }
}
