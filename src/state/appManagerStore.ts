import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";

/** 远程已装应用的持久信息（manifest 快照 + ESM 入口），启动时据此重新注册 */
export interface RemoteInstalled {
  url: string;
  name: string;
  icon: string;
  version: string;
  description?: string;
  category?: string;
  order?: number;
}

/**
 * 扩展应用管理（应用商店的后备状态）。
 * installed = 已安装的本地扩展 id；remote = 已安装的远程应用（id → 入口+清单）。
 * 默认预装 P0-P3 时代的三个扩展（朋友圈/便签/世界书），保证老用户升级后桌面不变，
 * 新装用户也可以在商店里卸载它们，只留基础能力。
 */
interface AppManagerState {
  installed: string[];
  remote: Record<string, RemoteInstalled>;
  /** 远程目录地址（应用商店「远程目录」区回填用） */
  catalogUrl: string;
  install: (id: string) => void;
  uninstall: (id: string) => void;
  addRemote: (id: string, info: RemoteInstalled) => void;
  removeRemote: (id: string) => void;
  setCatalogUrl: (url: string) => void;
}

export const useAppManagerStore = create<AppManagerState>()(
  persist(
    (set) => ({
      installed: ["moments", "notes", "worldbook"],
      remote: {},
      catalogUrl: "",
      install: (id) =>
        set((state) => (state.installed.includes(id) ? state : { installed: [...state.installed, id] })),
      uninstall: (id) => set((state) => ({ installed: state.installed.filter((x) => x !== id) })),
      addRemote: (id, info) => set((state) => ({ remote: { ...state.remote, [id]: info } })),
      removeRemote: (id) =>
        set((state) => {
          if (!state.remote[id]) return state;
          const remote = { ...state.remote };
          delete remote[id];
          return { remote };
        }),
      setCatalogUrl: (url) => set({ catalogUrl: url.trim() }),
    }),
    {
      name: "purin.apps",
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (state) => {
        // v1 → v2：补 remote/catalogUrl 两个字段
        const legacy = (state ?? {}) as Record<string, unknown>;
        return {
          ...legacy,
          remote: (legacy.remote as Record<string, RemoteInstalled>) ?? {},
          catalogUrl: (legacy.catalogUrl as string) ?? "",
        };
      },
    },
  ),
);
