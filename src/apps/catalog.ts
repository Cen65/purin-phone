import type { AppManifest } from "./types";

/**
 * 远程应用目录（P3 动态 App 市场的远程形态）。
 * 目录是一个放在任意 HTTPS 上的 JSON，格式：
 * {
 *   "type": "purin.app-catalog",
 *   "version": 1,
 *   "apps": [
 *     { "id": "hello", "name": "打招唿", "icon": "👋", "blurb": "…",
 *       "url": "https://example.com/purin-apps/hello/index.js" }
 *   ]
 * }
 * url 指向一个 ESM 模块，default 导出一个 (props: AppProps) => JSX 的组件
 * （与本地扩展同一契约，见 EXTENSIONS.load）。托管方需要给 .js 与本目录开 CORS。
 */

export const CATALOG_TYPE = "purin.app-catalog";

export interface CatalogApp {
  id: string;
  name: string;
  icon: string;
  version: string;
  description: string;
  category: NonNullable<AppManifest["category"]>;
  order: number;
  blurb: string;
  /** 远程 ESM 入口（构建产物，default 导出 AppProps 组件） */
  url: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CATEGORIES = new Set(["system", "social", "tools", "media", "game"]);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 解析目录 JSON → 合法条目列表（非法条目跳过而不是整体失败）；格式不对抛错 */
export function parseAppCatalog(json: string): CatalogApp[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("应用目录不是有效的 JSON");
  }
  if (!raw || typeof raw !== "object") throw new Error("应用目录格式不正确");
  const data = raw as Record<string, unknown>;
  if (data.type !== CATALOG_TYPE || !Array.isArray(data.apps)) {
    throw new Error("应用目录格式不正确");
  }

  const apps: CatalogApp[] = [];
  for (const item of data.apps) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = text(entry.id, 32);
    const name = text(entry.name, 24);
    const url = text(entry.url, 500);
    if (!ID_PATTERN.test(id) || !name || !/^https?:\/\//.test(url)) continue;
    const category = text(entry.category, 10);
    apps.push({
      id,
      name,
      icon: text(entry.icon, 4) || "📦",
      version: text(entry.version, 16) || "0.0.0",
      description: text(entry.description, 100),
      category: CATEGORIES.has(category) ? (category as CatalogApp["category"]) : "tools",
      order: Math.min(900, Math.max(1, Math.round(typeof entry.order === "number" ? entry.order : 100))),
      blurb: text(entry.blurb, 80) || text(entry.description, 80),
      url,
    });
  }
  return apps;
}
