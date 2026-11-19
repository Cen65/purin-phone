import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";

/**
 * 扩展应用管理（应用商店的后备状态）。
 * installed = 已安装的扩展 App id 列表；注册表里真正挂图标的是 apps/extensions.ts。
 * 默认预装 P0-P3 时代的三个扩展（朋友圈/便签/世界书），保证老用户升级后桌面不变，
 * 新装用户也可以在商店里卸载它们，只留基础能力。
 */
interface AppManagerState {
  installed: string[];
  install: (id: string) => void;
  uninstall: (id: string) => void;
}

export const useAppManagerStore = create<AppManagerState>()(
  persist(
    (set) => ({
      installed: ["moments", "notes", "worldbook"],
      install: (id) =>
        set((state) => (state.installed.includes(id) ? state : { installed: [...state.installed, id] })),
      uninstall: (id) => set((state) => ({ installed: state.installed.filter((x) => x !== id) })),
    }),
    {
      name: "purin.apps",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
