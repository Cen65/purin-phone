import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";
import { uid } from "../core/id";
import type { Character } from "../types";

export type CharacterDraft = Omit<Character, "id" | "createdAt">;

/** 角色卡格式标识（导出用）；旧标识 my-phone.character 在导入时继续兼容 */
export const CARD_TYPE = "purin.character";
const KNOWN_CARD_TYPES = new Set(["purin.character", "my-phone.character"]);

/**
 * 角色卡（P1 建立，P3 增强）：导入 / 导出的可交换格式。
 * 刻意保持小而稳：只含人设相关字段，type + version 供未来升级识别。
 * v1.1 追加可选的 firstMessage / exampleDialogue（向后兼容）。
 */
export interface CharacterCard {
  type: "purin.character";
  version: 1;
  name: string;
  avatar: string;
  tagline: string;
  systemPrompt: string;
  memory?: string;
  firstMessage?: string;
  exampleDialogue?: string;
  /** 说话篇幅（v1.2 可选，缺省 = short） */
  styleLength?: "short" | "medium" | "long";
  /** 允许偶尔 emoji / 颜文字 */
  styleEmoticon?: boolean;
  /** 允许偶尔（括号小动作） */
  styleAction?: boolean;
}

/** 导出为角色卡（文件内容由调用方下载，见 core/download.ts） */
export function toCard(character: Character): CharacterCard {
  const card: CharacterCard = {
    type: CARD_TYPE,
    version: 1,
    name: character.name,
    avatar: character.avatar,
    tagline: character.tagline,
    systemPrompt: character.systemPrompt,
  };
  if (character.memory?.trim()) card.memory = character.memory.trim();
  if (character.firstMessage?.trim()) card.firstMessage = character.firstMessage.trim();
  if (character.exampleDialogue?.trim()) card.exampleDialogue = character.exampleDialogue.trim();
  if (character.styleLength) card.styleLength = character.styleLength;
  if (character.styleEmoticon === true) card.styleEmoticon = true;
  if (character.styleAction === true) card.styleAction = true;
  return card;
}

/** 解析角色卡 JSON → CharacterDraft；格式不对抛 Error("角色卡格式不正确") */
export function parseCard(json: string): CharacterDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("角色卡格式不正确");
  }
  if (!raw || typeof raw !== "object") throw new Error("角色卡格式不正确");
  const card = raw as Partial<CharacterCard>;
  if (
    !KNOWN_CARD_TYPES.has(String(card.type)) ||
    typeof card.name !== "string" ||
    !card.name.trim() ||
    typeof card.avatar !== "string" ||
    typeof card.tagline !== "string" ||
    typeof card.systemPrompt !== "string"
  ) {
    throw new Error("角色卡格式不正确");
  }
  const draft: CharacterDraft = {
    name: card.name.trim(),
    avatar: card.avatar,
    tagline: card.tagline,
    systemPrompt: card.systemPrompt,
  };
  if (typeof card.memory === "string" && card.memory.trim()) draft.memory = card.memory.trim();
  if (typeof card.firstMessage === "string" && card.firstMessage.trim()) draft.firstMessage = card.firstMessage.trim();
  if (typeof card.exampleDialogue === "string" && card.exampleDialogue.trim()) {
    draft.exampleDialogue = card.exampleDialogue.trim();
  }
  if (card.styleLength === "short" || card.styleLength === "medium" || card.styleLength === "long") {
    draft.styleLength = card.styleLength;
  }
  if (card.styleEmoticon === true) draft.styleEmoticon = true;
  if (card.styleAction === true) draft.styleAction = true;
  return draft;
}

/**
 * 解析自由文本角色（.txt / .md 导入，P3）。约定格式（字段行可省略、顺序不限）：
 *   # 名字（首行，# 可省略）
 *   头像：🌷
 *   简介：一句话
 *   设定：多行……（直到下一个字段行）
 *   记忆：……   开场白：……   示例：……
 * 不认识的「xxx：yyy」行并进设定。宽容解析：只求好懂，不求严格。
 */
const FIELD_ALIASES: Record<string, keyof CharacterDraft> = {
  名字: "name",
  姓名: "name",
  头像: "avatar",
  简介: "tagline",
  设定: "systemPrompt",
  人设: "systemPrompt",
  记忆: "memory",
  开场白: "firstMessage",
  示例: "exampleDialogue",
  对话示例: "exampleDialogue",
};

export function parseCharacterText(text: string): CharacterDraft {
  const lines = text.split(/\r?\n/);
  const draft: CharacterDraft = { name: "", avatar: "🙂", tagline: "", systemPrompt: "" };
  let current: keyof CharacterDraft | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) appendField(draft, current, "");
      continue;
    }
    if (!draft.name && !current) {
      // 首个非空行：标题或「名字：xxx」
      const named = trimmed.match(/^(?:名字|姓名)[：:]\s*(.+)$/);
      if (named) {
        draft.name = named[1].trim();
        continue;
      }
      if (!/^[^：:]{1,12}[：:]/.test(trimmed)) {
        draft.name = trimmed.replace(/^#+\s*/, "");
        continue;
      }
    }
    const field = trimmed.match(/^([^：:]{1,6})[：:]\s*(.*)$/);
    if (field && FIELD_ALIASES[field[1].trim()]) {
      current = FIELD_ALIASES[field[1].trim()];
      appendField(draft, current, field[2].trim());
      continue;
    }
    if (current) {
      appendField(draft, current, trimmed);
    } else {
      appendField(draft, "systemPrompt", trimmed);
    }
  }

  draft.name = draft.name.trim() || "未命名角色";
  draft.systemPrompt = draft.systemPrompt.trim();
  return draft;
}

function appendField(draft: CharacterDraft, key: keyof CharacterDraft, value: string): void {
  if (key === "avatar") {
    // 头像只留最后一个非空值（emoji / URL），不拼接
    if (value.trim()) draft.avatar = value.trim().slice(0, 200);
    return;
  }
  const previous = (draft[key] as string | undefined) ?? "";
  const joiner = previous ? "\n" : "";
  (draft as unknown as Record<string, string>)[key] = `${previous}${joiner}${value}`;
}

interface CharactersState {
  characters: Character[];
  addCharacter: (draft: CharacterDraft) => Character;
  updateCharacter: (id: string, patch: Partial<CharacterDraft>) => void;
  removeCharacter: (id: string) => void;
}

export const useCharactersStore = create<CharactersState>()(
  persist(
    (set) => ({
      characters: [],
      addCharacter: (draft) => {
        const character: Character = { ...draft, id: uid(), createdAt: Date.now() };
        set((state) => ({ characters: [...state.characters, character] }));
        return character;
      },
      updateCharacter: (id, patch) =>
        set((state) => ({
          characters: state.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCharacter: (id) =>
        set((state) => ({ characters: state.characters.filter((c) => c.id !== id) })),
    }),
    {
      name: "purin.characters",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
