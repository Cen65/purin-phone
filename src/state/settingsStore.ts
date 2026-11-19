import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";

export interface ApiSettings {
  /** provider id，见 src/ai/providers.ts */
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface PersonaSettings {
  nickname: string;
}

interface SettingsState {
  api: ApiSettings;
  persona: PersonaSettings;
  themeId: string;
  /** 参与上下文的历史消息条数（P1：上下文策略，防止 token 超限） */
  windowSize: number;
  /** 生图模型（P4）：留空 = 未启用 /画 指令 */
  imageModel: string;
  /** 自动朗读 AI 回复（P4：Web Speech TTS） */
  voiceAutoSpeak: boolean;
  /** 记忆自动巩固（P4.5）：聊过一段后自动把新对话并进角色长期记忆 */
  memoryAuto: boolean;
  setApi: (patch: Partial<ApiSettings>) => void;
  setPersona: (patch: Partial<PersonaSettings>) => void;
  setThemeId: (themeId: string) => void;
  setWindowSize: (size: number) => void;
  setImageModel: (model: string) => void;
  setVoiceAutoSpeak: (on: boolean) => void;
  setMemoryAuto: (on: boolean) => void;
}

const DEFAULT_API: ApiSettings = {
  provider: "openai-compatible",
  baseUrl: "",
  apiKey: "",
  model: "",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      api: DEFAULT_API,
      persona: { nickname: "" },
      themeId: "light",
      windowSize: 20,
      imageModel: "",
      voiceAutoSpeak: false,
      memoryAuto: true,
      setApi: (patch) => set((state) => ({ api: { ...state.api, ...patch } })),
      setPersona: (patch) => set((state) => ({ persona: { ...state.persona, ...patch } })),
      setThemeId: (themeId) => set({ themeId }),
      setWindowSize: (size) => set({ windowSize: Math.min(100, Math.max(4, Math.round(size))) }),
      setImageModel: (model) => set({ imageModel: model }),
      setVoiceAutoSpeak: (on) => set({ voiceAutoSpeak: on }),
      setMemoryAuto: (on) => set({ memoryAuto: on }),
    }),
    {
      name: "purin.settings",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

/** API 是否已配置完成（可用于引导提示） */
export function isApiReady(api: ApiSettings): boolean {
  return api.baseUrl.trim().length > 0 && api.apiKey.trim().length > 0 && api.model.trim().length > 0;
}
