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
 * 角色卡（P1）：导入 / 导出的可交换格式。
 * 刻意保持小而稳：只含人设相关字段，type + version 供未来升级识别。
 */
export interface CharacterCard {
  type: "purin.character";
  version: 1;
  name: string;
  avatar: string;
  tagline: string;
  systemPrompt: string;
  memory?: string;
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
  return draft;
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
