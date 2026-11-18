/**
 * 深链（hash 路由）：把「当前打开的 App + 参数」编码进 location.hash，
 * 让刷新/分享链接/浏览器后退都能回到同一个界面。
 * 纯函数无副作用，与 phoneStore 的集成见 phoneStore.ts 的 initDeeplink()。
 */

export interface AppRoute {
  appId: string;
  /** 只保留字符串参数——hash 里只能承载这些 */
  params?: Record<string, string>;
}

export function encodeAppRoute(appId: string, params?: unknown): string {
  const simple: Record<string, string> = {};
  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) simple[key] = value;
    }
  }
  const query = new URLSearchParams(simple).toString();
  return `#/app/${encodeURIComponent(appId)}${query ? `?${query}` : ""}`;
}

export function parseAppRoute(hash: string): AppRoute | null {
  const match = hash.match(/^#\/app\/([^/?]+)(?:\?(.*))?$/);
  if (!match) return null;
  const appId = decodeURIComponent(match[1]!);
  const params: Record<string, string> = {};
  if (match[2]) {
    new URLSearchParams(match[2]).forEach((value, key) => {
      params[key] = value;
    });
  }
  return { appId, params: Object.keys(params).length > 0 ? params : undefined };
}
