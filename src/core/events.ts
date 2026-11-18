/**
 * 轻量类型化事件总线。
 * 这是全局唯一的跨模块通信通道：App 之间不直接 import 对方，
 * 而是通过事件解耦（例如聊天完成 → 发通知 → 状态栏角标）。
 */
export type EventHandler<P> = (payload: P) => void;

export interface EventBus<Events extends object> {
  on<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): () => void;
  emit<K extends keyof Events>(type: K, payload: Events[K]): void;
}

export function createEventBus<Events extends object>(): EventBus<Events> {
  const handlers = new Map<keyof Events, Set<EventHandler<never>>>();
  return {
    on(type, handler) {
      const set = handlers.get(type) ?? new Set();
      set.add(handler as EventHandler<never>);
      handlers.set(type, set);
      return () => {
        set.delete(handler as EventHandler<never>);
      };
    },
    emit(type, payload) {
      const set = handlers.get(type);
      if (!set) return;
      for (const handler of set) {
        try {
          (handler as EventHandler<typeof payload>)(payload);
        } catch (error) {
          // 单个监听器出错不影响其他监听器
          console.error(`[events] handler error on "${String(type)}"`, error);
        }
      }
    },
  };
}

/** 手机系统级事件定义。App 可以扩展自己的事件，但系统事件在这里集中声明。 */
export interface PhoneEvents {
  /** 系统通知：由任意模块发出，NotificationHost 负责展示。 */
  notify: {
    appId?: string;
    title: string;
    body?: string;
    kind?: "info" | "error";
  };
  /** 一条 AI 回复完成。 */
  "chat:reply-finished": { characterId: string; content: string };
  /** 模拟来电响起（ContactsApp 发起，CallHost 展示；可监听做铃声等）。 */
  "call:incoming": { characterId: string };
  /** 一条朋友圈动态发布成功（角色或用户）。 */
  "moments:posted": { momentId: string; authorName: string };
}

export const bus = createEventBus<PhoneEvents>();
