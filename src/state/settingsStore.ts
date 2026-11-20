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
  /** 印象档案自动巩固：攒够一段新对话后自动刷新"TA 眼中的你" */
  impressionAuto: boolean;
  /** 好感度用 LLM 打分（更细腻但每轮回复多一次小请求；关 = 关键词法） */
  affectionLlm: boolean;
  /** 朋友圈配图：角色发圈时顺手生成一张图（需配置生图模型，失败不影响发文字） */
  momentImageOn: boolean;
  setApi: (patch: Partial<ApiSettings>) => void;
  setPersona: (patch: Partial<PersonaSettings>) => void;
  setThemeId: (themeId: string) => void;
  setWindowSize: (size: number) => void;
  setImageModel: (model: string) => void;
  setVoiceAutoSpeak: (on: boolean) => void;
  setMemoryAuto: (on: boolean) => void;
  setImpressionAuto: (on: boolean) => void;
  setAffectionLlm: (on: boolean) => void;
  setMomentImageOn: (on: boolean) => void;
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
      themeId: "sakura",
      windowSize: 20,
      imageModel: "",
      voiceAutoSpeak: false,
      memoryAuto: true,
      impressionAuto: true,
      affectionLlm: false,
      momentImageOn: true,
      setApi: (patch) => set((state) => ({ api: { ...state.api, ...patch } })),
      setPersona: (patch) => set((state) => ({ persona: { ...state.persona, ...patch } })),
      setThemeId: (themeId) => set({ themeId }),
      setWindowSize: (size) => set({ windowSize: Math.min(100, Math.max(4, Math.round(size))) }),
      setImageModel: (model) => set({ imageModel: model }),
      setVoiceAutoSpeak: (on) => set({ voiceAutoSpeak: on }),
      setMemoryAuto: (on) => set({ memoryAuto: on }),
      setImpressionAuto: (on) => set({ impressionAuto: on }),
      setAffectionLlm: (on) => set({ affectionLlm: on }),
      setMomentImageOn: (on) => set({ momentImageOn: on }),
    }),
    {
      name: "purin.settings",
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      // v1 → v2：默认主题换成樱粉；只在用户还停留在旧默认"light"时引导过去，明确选过别的主题则尊重
      migrate: (state) => {
        const saved = (state ?? {}) as { themeId?: string };
        if (saved.themeId === "light" || saved.themeId === undefined) {
          return { ...saved, themeId: "sakura" } as SettingsState;
        }
        return state as SettingsState;
      },
    },
  ),
);

/** API 是否已配置完成（可用于引导提示） */
export function isApiReady(api: ApiSettings): boolean {
  return api.baseUrl.trim().length > 0 && api.apiKey.trim().length > 0 && api.model.trim().length > 0;
}
