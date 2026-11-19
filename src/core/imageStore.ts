/**
 * 聊天图片仓（P4 生图）：图片存 IndexedDB，消息里只留 imageId。
 * 不放 localStorage：5MB 配额放几张 base64 图就会撑爆，且写入失败是静默丢数据。
 * Node/测试环境（无 indexedDB）下所有操作降级为空实现。
 */

import { uid } from "./id";

const DB_NAME = "purin-images";
const STORE = "images";
const DB_VERSION = 1;

export interface StoredImage {
  id: string;
  dataUrl: string;
  createdAt: number;
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB 操作失败"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** 保存一张图（dataURL），返回 imageId；不可用环境返回空串 */
export async function saveImage(dataUrl: string): Promise<string> {
  if (!hasIndexedDB()) return "";
  const image: StoredImage = { id: uid(), dataUrl, createdAt: Date.now() };
  await run("readwrite", (store) => store.put(image));
  return image.id;
}

/** 读取图片 dataURL；不存在或不可用返回 null */
export async function loadImage(id: string): Promise<string | null> {
  if (!id || !hasIndexedDB()) return null;
  try {
    const image = await run<StoredImage | undefined>("readonly", (store) => store.get(id));
    return image?.dataUrl ?? null;
  } catch {
    return null;
  }
}

/** 删除图片（清空会话时消息已删，这里是可选的兜底清理入口） */
export async function deleteImage(id: string): Promise<void> {
  if (!id || !hasIndexedDB()) return;
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {
    // ignore
  }
}

/** 批量读取（锁脸参考图等）：按传入顺序返回 dataURL，缺的跳过 */
export async function loadImages(ids: string[]): Promise<string[]> {
  const results = await Promise.all(ids.filter(Boolean).map((id) => loadImage(id)));
  return results.filter((dataUrl): dataUrl is string => Boolean(dataUrl));
}
