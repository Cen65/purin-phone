import { create } from "zustand";
import { encodeAppRoute, parseAppRoute } from "../core/deeplink";

/**
 * 手机系统状态：当前打开的 App、启动参数、角标、锁屏。
 * 导航模型是"手机式"应用栈；P2 起通过 hash 路由（core/deeplink.ts）
 * 与浏览器地址栏双向同步：openApp 写 hash，hashchange 回放 openApp。
 */
interface PhoneState {
  activeAppId: string | null;
  /** appId → 打开时携带的参数（结构由各 App 自行约定） */
  params: Record<string, unknown>;
  /** appId → 未读角标数 */
  badges: Record<string, number>;
  /** 锁屏（P2）：true 时 LockScreen 盖住整个界面 */
  locked: boolean;
  openApp: (appId: string, params?: unknown) => void;
  goHome: () => void;
  bumpBadge: (appId: string) => void;
  lock: () => void;
  unlock: () => void;
}

function sameRoute(current: { appId: string; params?: Record<string, string> } | null, appId: string, params?: Record<string, string>): boolean {
  if (!current || current.appId !== appId) return false;
  const a = current.params ?? {};
  const b = params ?? {};
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
}

function routeOf(appId: string | null, params: Record<string, unknown>): { appId: string; params?: Record<string, string> } | null {
  if (!appId) return null;
  const source = params[appId];
  if (!source || typeof source !== "object") return { appId };
  const simple: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value === "string" && value) simple[key] = value;
  }
  return { appId, params: Object.keys(simple).length ? simple : undefined };
}

export const usePhoneStore = create<PhoneState>()((set) => ({
  activeAppId: null,
  params: {},
  badges: {},
  locked: false,
  openApp: (appId, params) => {
    set((state) => ({
      activeAppId: appId,
      params: { ...state.params, [appId]: params },
      badges: { ...state.badges, [appId]: 0 },
    }));
    if (typeof location !== "undefined") {
      const next = encodeAppRoute(appId, params);
      if (location.hash !== next) history.replaceState(null, "", next);
    }
  },
  goHome: () => {
    set({ activeAppId: null });
    if (typeof location !== "undefined" && location.hash !== "#/") {
      history.replaceState(null, "", "#/");
    }
  },
  bumpBadge: (appId) =>
    set((state) => ({ badges: { ...state.badges, [appId]: (state.badges[appId] ?? 0) + 1 } })),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));

/** hashchange → openApp（避免循环：同路由直接忽略） */
function applyRouteFromHash(): void {
  const route = parseAppRoute(location.hash);
  if (!route) return;
  const state = usePhoneStore.getState();
  if (sameRoute(routeOf(state.activeAppId, state.params), route.appId, route.params)) return;
  state.openApp(route.appId, route.params);
}

/**
 * 初始化深链（main.tsx 引导时调用一次）：
 * 1. 启动时按地址栏 hash 恢复界面；
 * 2. 监听 hashchange（浏览器后退/前进、外部链接跳入）。
 */
export function initDeeplink(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("hashchange", applyRouteFromHash);
  if (location.hash) applyRouteFromHash();
}
