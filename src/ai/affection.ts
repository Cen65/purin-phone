import type { Character } from "../types";
import { useCharactersStore } from "../state/charactersStore";

/**
 * 情感模型（轻量确定性版）：
 * - affection 好感度 0~100（默认 50），随每条用户消息按关键词增减，单条封顶 ±4；
 * - mood 心情标签，由最近一次增减方向推导（开心/平静/有点低落/难过）；
 * - 两者注入系统提示词（见 prompt.ts characterLines），影响语气与热情程度。
 * 关键词法是刻意的取舍：零 API 成本、可测试、行为可预期；
 * 「让 LLM 自己打分」的版本以后可以在 maybeAutoConsolidate 的节奏上叠加。
 */

export const AFFECTION_DEFAULT = 50;

/** 正向词（每个 +2） */
const POSITIVE_WORDS = [
  "谢谢", "喜欢", "想你", "爱你", "开心", "哈哈", "抱抱", "亲亲",
  "好棒", "可爱", "温柔", "加油", "心疼", "好听", "好看",
];

/** 负向词（每个 -2） */
const NEGATIVE_WORDS = [
  "讨厌", "好烦", "烦死", "滚蛋", "闭嘴", "无聊", "呵呵", "受够", "别理我",
];

export function clampAffection(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** 一条用户消息带来的好感增减（纯函数；单条封顶 ±4，防刷） */
export function affectionDelta(text: string): number {
  let delta = 0;
  for (const word of POSITIVE_WORDS) if (text.includes(word)) delta += 2;
  for (const word of NEGATIVE_WORDS) if (text.includes(word)) delta -= 2;
  return Math.max(-4, Math.min(4, delta));
}

/** 心情标签：正向 → 开心；小负 → 有点低落；重挫（-4）→ 难过；无变化沿用旧心情 */
export function nextMood(delta: number, previous?: string): string {
  if (delta > 0) return "开心";
  if (delta < 0) return delta <= -4 ? "难过" : "有点低落";
  return previous?.trim() || "平静";
}

/** 好感阶段（用于提示词与 UI 展示） */
export function affectionStage(affection: number): string {
  if (affection >= 85) return "亲密无间";
  if (affection >= 65) return "亲近";
  if (affection >= 40) return "熟悉";
  if (affection >= 20) return "一般";
  return "疏远";
}

export interface AffectionState {
  affection: number;
  mood: string;
}

/** 由一条用户消息推导下一帧情感状态（纯函数） */
export function nextAffectionState(
  text: string,
  current?: Partial<Pick<Character, "affection" | "mood">>,
): AffectionState {
  const base = typeof current?.affection === "number" ? current.affection : AFFECTION_DEFAULT;
  const delta = affectionDelta(text);
  return { affection: clampAffection(base + delta), mood: nextMood(delta, current?.mood) };
}

/** 聊天发送路径钩子：更新角色好感/心情（角色不存在静默跳过）。返回新状态供测试断言。 */
export function applyAffectionFromMessage(characterId: string, text: string): AffectionState | null {
  const store = useCharactersStore.getState();
  const character = store.characters.find((c) => c.id === characterId);
  if (!character) return null;
  const state = nextAffectionState(text, character);
  store.updateCharacter(characterId, state);
  return state;
}
