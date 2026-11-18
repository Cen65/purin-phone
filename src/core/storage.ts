import type { StateStorage } from "zustand/middleware";

/**
 * 存储适配层：所有持久化都经过这里，底座默认用 localStorage。
 * 之后升级 IndexedDB（大量聊天记录）或云端同步时，
 * 只需要提供一个相同接口的 adapter 并在 store 里替换，业务代码零改动。
 *
 * localStorage 不可用（node / SSR / 隐私模式抛错）时退回进程内 Map：
 * 会话内数据不丢，进程结束后不保留。
 */
const memoryStore = new Map<string, string>();

export const safeLocalStorage: StateStorage = {
  getItem(name) {
    try {
      if (typeof localStorage !== "undefined") return localStorage.getItem(name);
    } catch {
      // 落入内存兜底
    }
    return memoryStore.get(name) ?? null;
  },
  setItem(name, value) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(name, value);
        return;
      }
    } catch {
      // 隐私模式/配额满时静默失败，落入内存兜底，不阻塞应用
    }
    memoryStore.set(name, value);
  },
  removeItem(name) {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(name);
    } catch {
      // ignore
    }
    memoryStore.delete(name);
  },
};

/**
 * 品牌更名迁移：项目由 my-phone 更名为 Purin，持久化 key 前缀随之更换。
 * 所有 store 都 import 本模块，这段顶层代码会在任何 persist hydrate 之前执行：
 * 新 key 没有数据而旧 key 有时，整体搬一次（幂等；旧 key 保留不删，回滚版本也能用）。
 * device 指纹同样走这里——已绑定的激活码不会因为改名而失效。
 */
const LEGACY_KEYS: Record<string, string> = {
  "my-phone.settings": "purin.settings",
  "my-phone.characters": "purin.characters",
  "my-phone.chat": "purin.chat",
  "my-phone.groups": "purin.groups",
  "my-phone.moments": "purin.moments",
  "my-phone.notes": "purin.notes",
  "my-phone.license": "purin.license",
  "my-phone.device": "purin.device",
};
for (const [legacyKey, nextKey] of Object.entries(LEGACY_KEYS)) {
  const next = safeLocalStorage.getItem(nextKey);
  if (typeof next === "string" && next) continue;
  const legacy = safeLocalStorage.getItem(legacyKey);
  if (typeof legacy === "string" && legacy) safeLocalStorage.setItem(nextKey, legacy);
}
