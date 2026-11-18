import { create } from "zustand";
import { uid } from "../core/id";

/**
 * 通知中心：bus 的 notify 事件在这里沉淀为可回看的历史（P2）。
 * 横幅 toast 由 NotificationHost 负责；这里只管"收件箱"。
 * 会话级数据（不持久化）：重启清空，避免陈旧通知堆积。
 */

export interface PhoneNotification {
  id: string;
  appId?: string;
  title: string;
  body?: string;
  /** 缺省按 info 处理 */
  kind?: "info" | "error";
  at: number;
  read: boolean;
}

const MAX_ITEMS = 50;

interface NotificationsState {
  items: PhoneNotification[];
  push: (input: Omit<PhoneNotification, "id" | "at" | "read">) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  items: [],
  push: (input) =>
    set((state) => ({
      items: [
        ...state.items,
        { ...input, kind: input.kind ?? "info", id: uid(), at: Date.now(), read: false },
      ].slice(-MAX_ITEMS),
    })),
  markAllRead: () => set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) })),
  clear: () => set({ items: [] }),
}));

/** 未读数（selector 用，返回原始值保证引用稳定） */
export function selectUnreadCount(state: NotificationsState): number {
  return state.items.reduce((count, item) => (item.read ? count : count + 1), 0);
}
