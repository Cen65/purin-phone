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
