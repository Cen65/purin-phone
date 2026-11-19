import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";

/**
 * 主动消息引擎的状态（purin.proactive）。
 * lastAt 记录每个角色最近一次主动发消息的时间，用于计算下一次到期；
 * engineOn 是全局总开关；gapMinutes 是每个角色两次主动消息的最小间隔；
 * checkMinutes 是引擎的巡检周期（到期判定以 gapMinutes 为准，巡检只是节拍器）。
 * momentsOn / momentGapMinutes / lastMomentAt 是朋友圈自动发帖的同款三件套。
 */
interface ProactiveState {
  engineOn: boolean;
  gapMinutes: number;
  checkMinutes: number;
  lastAt: Record<string, number>;
  /** 朋友圈自动发帖总开关 */
  momentsOn: boolean;
  /** 同一角色两次自动发朋友圈的最小间隔（分钟） */
  momentGapMinutes: number;
  /** characterId → 最近一次自动发朋友圈时间 */
  lastMomentAt: Record<string, number>;
  setEngineOn: (on: boolean) => void;
  setGapMinutes: (minutes: number) => void;
  setCheckMinutes: (minutes: number) => void;
  touch: (characterId: string, at: number) => void;
  setMomentsOn: (on: boolean) => void;
  setMomentGapMinutes: (minutes: number) => void;
  touchMoment: (characterId: string, at: number) => void;
}

export const useProactiveStore = create<ProactiveState>()(
  persist(
    (set) => ({
      engineOn: true,
      gapMinutes: 120,
      checkMinutes: 10,
      lastAt: {},
      momentsOn: true,
      momentGapMinutes: 240,
      lastMomentAt: {},
      setEngineOn: (on) => set({ engineOn: on }),
      setGapMinutes: (minutes) => set({ gapMinutes: Math.max(15, Math.round(minutes)) }),
      setCheckMinutes: (minutes) => set({ checkMinutes: Math.max(1, Math.round(minutes)) }),
      touch: (characterId, at) =>
        set((state) => ({ lastAt: { ...state.lastAt, [characterId]: at } })),
      setMomentsOn: (on) => set({ momentsOn: on }),
      setMomentGapMinutes: (minutes) => set({ momentGapMinutes: Math.max(30, Math.round(minutes)) }),
      touchMoment: (characterId, at) =>
        set((state) => ({ lastMomentAt: { ...state.lastMomentAt, [characterId]: at } })),
    }),
    { name: "purin.proactive", version: 1, storage: createJSONStorage(() => safeLocalStorage) },
  ),
);
