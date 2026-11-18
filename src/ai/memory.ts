import type { LLMMessage } from "./types";
import type { Character } from "../types";
import type { PersonaSettings } from "../state/settingsStore";
import type { ChatMessage } from "../state/chatStore";
import { chatOnce } from "./creative";
import { useSettingsStore, isApiReady } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";

/**
 * 记忆自动化（P3）：把最近对话里值得长期记住的事，合并进角色的 memory。
 * 产出的草稿给用户过目（可编辑）后才写入——记忆的最终决定权在人。
 */

/** 单次总结最多看多少条消息 */
export const MEMORY_WINDOW = 40;
/** 记忆文本上限（字符） */
export const MEMORY_LIMIT = 2000;

export interface MemoryInput {
  character: Character;
  persona: PersonaSettings;
  history: ChatMessage[];
}

export function buildMemoryMessages(input: MemoryInput): LLMMessage[] {
  const { character, persona, history } = input;
  const me = persona.nickname.trim() || "我";
  const transcript = history
    .slice(-MEMORY_WINDOW)
    .map((message) => `${message.role === "user" ? me : character.name}：${message.content}`)
    .join("\n");

  const system = [
    "你是角色的记忆管理器。把「最近对话」里值得长期记住的信息，合并进「现有记忆」，输出合并后的完整记忆文本。",
    "记住的应该是：用户透露的喜好/习惯/重要经历、两人的约定或共同回忆、称呼变化等。",
    "不要记：闲聊寒暄、一次性的客套话、对话原文复述。",
    "输出格式：每条一行、以「- 」开头，总共 300 字以内；只输出记忆本身，不要解释、不要标题。",
  ].join("\n");
  const user = [
    `角色名：${character.name}`,
    `现有记忆（可能为空，合并时尽量保留其中仍然有效的条目）：\n${character.memory?.trim() || "（空）"}`,
    `最近对话：\n${transcript || "（空）"}`,
    "请输出合并后的记忆。",
  ].join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 截断保护：记忆超长时截到上限（按行切，保留完整的行） */
export function capMemory(memory: string, limit = MEMORY_LIMIT): string {
  const text = memory.trim();
  if (text.length <= limit) return text;
  const lines = text.split("\n");
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > limit) break;
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n") || text.slice(0, limit);
}

/**
 * 总结并返回合并后的记忆草稿（不落库——由 UI 弹窗让用户确认后再保存）。
 * 失败抛错，由调用方提示。
 */
export async function mergeMemory(characterId: string): Promise<string> {
  const character = useCharactersStore.getState().characters.find((c) => c.id === characterId);
  if (!character) throw new Error("角色不存在");
  const settings = useSettingsStore.getState();
  if (!isApiReady(settings.api)) throw new Error("请先配置 AI 服务");

  const history = useChatStore.getState().messages[characterId] ?? [];
  const merged = await chatOnce(
    buildMemoryMessages({ character, persona: settings.persona, history }),
  );
  return capMemory(merged);
}
