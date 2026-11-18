import { create } from "zustand";
import { uid } from "../core/id";
import { useChatStore } from "./chatStore";
import { useCharactersStore } from "./charactersStore";

/**
 * 模拟来电（P2）：状态机 idle → incoming →(接听)→ active →(挂断)→ ended → idle。
 * 通话内容是"语音风格的文字短句"（每条 ≤15 字左右），由 src/ai/creative.ts
 * 的 callReply 生成；挂断后转写自动存进与该角色的普通聊天记录。
 * 会话级状态，不持久化。
 */

export type CallPhase = "idle" | "incoming" | "active" | "ended";

export interface CallLine {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
}

interface CallState {
  phase: CallPhase;
  characterId: string | null;
  startedAt: number | null;
  endedReason: string | null;
  lines: CallLine[];
  startIncoming: (characterId: string) => void;
  accept: () => void;
  decline: () => void;
  pushLine: (role: "user" | "assistant", content: string) => void;
  /** 挂断：saveTranscript=true 时把通话转写存入该角色的聊天记录 */
  hangup: (reason?: string, saveTranscript?: boolean) => void;
  reset: () => void;
}

function characterName(id: string | null): string {
  if (!id) return "";
  return useCharactersStore.getState().characters.find((c) => c.id === id)?.name ?? "";
}

export const useCallStore = create<CallState>()((set, get) => ({
  phase: "idle",
  characterId: null,
  startedAt: null,
  endedReason: null,
  lines: [],
  startIncoming: (characterId) =>
    set({ phase: "incoming", characterId, startedAt: null, endedReason: null, lines: [] }),
  accept: () => {
    if (get().phase !== "incoming") return;
    set({ phase: "active", startedAt: Date.now() });
  },
  decline: () => {
    if (get().phase !== "incoming") return;
    set({ phase: "idle", characterId: null, startedAt: null, endedReason: null, lines: [] });
  },
  pushLine: (role, content) => {
    if (get().phase !== "active") return;
    set((state) => ({ lines: [...state.lines, { id: uid(), role, content, at: Date.now() }] }));
  },
  hangup: (reason = "通话结束", saveTranscript = true) => {
    const { phase, characterId, lines } = get();
    if (phase !== "active" && phase !== "incoming") return;
    if (saveTranscript && characterId && lines.length > 0) {
      const chat = useChatStore.getState();
      for (const line of lines) chat.insertMessage(characterId, line.role, line.content);
    }
    set({
      phase: "ended",
      endedReason: characterName(characterId) ? `${characterName(characterId)} · ${reason}` : reason,
    });
  },
  reset: () => set({ phase: "idle", characterId: null, startedAt: null, endedReason: null, lines: [] }),
}));

/** 通话时长展示 mm:ss */
export function formatCallDuration(startedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
