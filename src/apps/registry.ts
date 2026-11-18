import type { AppManifest } from "./types";

/**
 * App 注册表（运行时插件风格的内核）。
 * registerApp 在应用启动时（或未来：插件加载时）调用；
 * 桌面、AppHost、角标系统都从注册表读取，系统对新 App 零感知。
 */
const apps = new Map<string, AppManifest>();

export function registerApp(manifest: AppManifest): void {
  if (apps.has(manifest.id)) {
    throw new Error(`[apps] 应用 id 重复：${manifest.id}`);
  }
  apps.set(manifest.id, manifest);
}

export function unregisterApp(id: string): void {
  apps.delete(id);
}

export function getApp(id: string): AppManifest | undefined {
  return apps.get(id);
}

export function getApps(): AppManifest[] {
  return [...apps.values()].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name),
  );
}
