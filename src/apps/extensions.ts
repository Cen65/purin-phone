import { lazy, type ComponentType } from "react";
import type { AppManifest, AppProps } from "./types";
import { registerApp, unregisterApp, getApp } from "./registry";
import { useAppManagerStore } from "../state/appManagerStore";
import { usePhoneStore } from "../state/phoneStore";
import type { CatalogApp } from "./catalog";

/**
 * 扩展应用目录（应用商店的货架）。
 * 「安装」= 把组件（懒加载包装）注册进 App 注册表 → 桌面立刻出现图标；
 * 「卸载」= 反注册 + 清角标 + 若正处于该应用则回桌面。应用数据保留，重装即恢复。
 *
 * 本地目录编译进包（代码分块按需下载，不装不加载）；
 * 远程目录（catalog.ts）在运行时从任意 HTTPS 加载 ESM 入口，安装协议一致。
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

/** 远程应用的动态 import 缓存（同 id 重复安装不重复请求模块） */
const remoteLoaders = new Map<string, () => Promise<{ default: ComponentType<AppProps> }>>();

/** 这个 id 是否已被占用（内置/本地货架/已注册的远程应用）——远程应用不允许覆盖 */
export function isReservedAppId(id: string): boolean {
  return Boolean(EXTENSIONS[id]) || Boolean(getApp(id));
}

/** 注册一个远程应用（入口是运行时的 ESM URL；首次打开才加载） */
export function registerRemoteApp(id: string, url: string, manifest: Omit<AppManifest, "component" | "id">): boolean {
  if (!id || !/^https?:\/\//.test(url)) return false;
  let loader = remoteLoaders.get(id);
  if (!loader) {
    loader = () => import(/* @vite-ignore */ url);
    remoteLoaders.set(id, loader);
  }
  registerApp({
    ...manifest,
    id,
    component: lazy(loader) as unknown as ComponentType<AppProps>,
  });
  return true;
}

/** 启动时按持久化的安装列表装回全部扩展（本地 + 远程） */
export function registerInstalledExtensions(): void {
  const manager = useAppManagerStore.getState();
  for (const id of manager.installed) {
    if (EXTENSIONS[id]) registerExtension(id);
  }
  for (const [id, info] of Object.entries(manager.remote)) {
    registerRemoteApp(id, info.url, {
      name: info.name,
      icon: info.icon,
      version: info.version,
      description: info.description,
      category: (info.category as AppManifest["category"]) ?? "tools",
      order: info.order ?? 100,
    });
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

/** 安装一个远程目录应用：校验 id 不与本地冲突，注册 + 记录入口与清单快照 */
export function installRemoteApp(app: CatalogApp): boolean {
  if (EXTENSIONS[app.id]) return false; // 不允许覆盖本地货架
  if (getApp(app.id)) return false; // 已注册（含重复安装）
  const ok = registerRemoteApp(app.id, app.url, {
    name: app.name,
    icon: app.icon,
    version: app.version,
    description: app.description,
    category: app.category,
    order: app.order,
  });
  if (!ok) return false;
  useAppManagerStore.getState().addRemote(app.id, {
    url: app.url,
    name: app.name,
    icon: app.icon,
    version: app.version,
    description: app.description,
    category: app.category,
    order: app.order,
  });
  return true;
}

/** 卸载（本地与远程通用）：反注册 + 清记录 + 清角标；若正打开该应用则回桌面。数据保留，重装可恢复。 */
export function uninstallApp(id: string): void {
  unregisterApp(id);
  const manager = useAppManagerStore.getState();
  manager.uninstall(id);
  if (manager.remote[id]) manager.removeRemote(id);
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
