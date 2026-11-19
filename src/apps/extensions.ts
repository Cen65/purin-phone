import { lazy, type ComponentType } from "react";
import type { AppManifest, AppProps } from "./types";
import { registerApp, unregisterApp } from "./registry";
import { useAppManagerStore } from "../state/appManagerStore";
import { usePhoneStore } from "../state/phoneStore";

/**
 * 扩展应用目录（应用商店的货架）。
 * 「安装」= 把组件（懒加载包装）注册进 App 注册表 → 桌面立刻出现图标；
 * 「卸载」= 反注册 + 清角标 + 若正处于该应用则回桌面。应用数据保留，重装即恢复。
 *
 * 目录当前编译进包（代码分块按需下载，不装不加载）；
 * 未来接远程目录时只需把 EXTENSIONS 换成远端 JSON + 远程入口，安装协议不变。
 */
export interface ExtensionDef {
  /** 商店页展示的信息（与 AppManifest 一致，去掉 component） */
  manifest: Omit<AppManifest, "component">;
  /** 商店页的一句卖点文案 */
  blurb: string;
  /** 动态 import：只有安装并打开时才会加载对应代码块 */
  load: () => Promise<{ default: ComponentType<AppProps> }>;
}

export const EXTENSIONS: Record<string, ExtensionDef> = {
  moments: {
    manifest: {
      id: "moments",
      name: "朋友圈",
      icon: "🌟",
      version: "0.1.0",
      description: "角色们的动态：点赞、评论",
      category: "social",
      order: 40,
    },
    blurb: "角色会自己发动态，你能点赞、评论，也发你自己的近况。",
    load: () => import("./moments/MomentsApp"),
  },
  notes: {
    manifest: {
      id: "notes",
      name: "便签",
      icon: "📝",
      version: "0.1.0",
      description: "随手记",
      category: "tools",
      order: 30,
    },
    blurb: "最轻的备忘录，也是写自己 App 时的参考模板。",
    load: () => import("./notes/NotesApp"),
  },
  worldbook: {
    manifest: {
      id: "worldbook",
      name: "世界书",
      icon: "📖",
      version: "0.1.0",
      description: "给角色挂载背景知识库",
      category: "tools",
      order: 35,
    },
    blurb: "常驻/关键词/正则触发的背景设定库，让角色懂你们的小世界。",
    load: () => import("./worldbook/WorldbookApp"),
  },
  weather: {
    manifest: {
      id: "weather",
      name: "天气",
      icon: "🌤",
      version: "0.1.0",
      description: "看天气，顺便让角色唠两句",
      category: "tools",
      order: 25,
    },
    blurb: "真实天气（open-meteo，无需注册），选个城市就能看温度和风。",
    load: () => import("./weather/WeatherApp"),
  },
  anniversary: {
    manifest: {
      id: "anniversary",
      name: "纪念日",
      icon: "💞",
      version: "0.1.0",
      description: "在一起第几天了",
      category: "tools",
      order: 26,
    },
    blurb: "记录每个开始的日子：第 N 天、下一个周年还有多远。",
    load: () => import("./anniversary/AnniversaryApp"),
  },
};

/** 把一个扩展注册进系统（懒加载组件，首次打开才拉代码块） */
export function registerExtension(id: string): boolean {
  const def = EXTENSIONS[id];
  if (!def) return false;
  const manifest: AppManifest = {
    ...def.manifest,
    component: lazy(def.load) as unknown as ComponentType<AppProps>,
  };
  registerApp(manifest);
  return true;
}

/** 启动时按持久化的安装列表装回全部扩展 */
export function registerInstalledExtensions(): void {
  for (const id of useAppManagerStore.getState().installed) {
    if (EXTENSIONS[id]) registerExtension(id);
  }
}

/** 安装：注册 + 记录（幂等；未上架 id 返回 false） */
export function installApp(id: string): boolean {
  if (!EXTENSIONS[id]) return false;
  if (useAppManagerStore.getState().installed.includes(id)) return false;
  if (!registerExtension(id)) return false;
  useAppManagerStore.getState().install(id);
  return true;
}

/** 卸载：反注册 + 清记录 + 清角标；若正打开该应用则回桌面。数据保留，重装可恢复。 */
export function uninstallApp(id: string): void {
  unregisterApp(id);
  useAppManagerStore.getState().uninstall(id);
  const phone = usePhoneStore.getState();
  if (phone.badges[id]) {
    usePhoneStore.setState((state) => {
      const badges = { ...state.badges };
      delete badges[id];
      return { badges };
    });
  }
  if (phone.activeAppId === id) phone.goHome();
}
