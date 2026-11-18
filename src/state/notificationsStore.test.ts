import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationsStore, selectUnreadCount } from "./notificationsStore";

/** 通知中心（P2）：cap 50、已读、清空。 */
describe("notificationsStore", () => {
  beforeEach(() => {
    useNotificationsStore.setState({ items: [] });
  });

  it("push 超过 50 条时只保留最近 50 条", () => {
    for (let i = 0; i < 55; i += 1) {
      useNotificationsStore.getState().push({ title: `通知${i}` });
    }
    const items = useNotificationsStore.getState().items;
    expect(items).toHaveLength(50);
    expect(items[0]?.title).toBe("通知5");
    expect(items[49]?.title).toBe("通知54");
  });

  it("selectUnreadCount 统计未读，markAllRead 后归零", () => {
    const store = useNotificationsStore.getState();
    store.push({ title: "a" });
    store.push({ title: "b" });
    expect(selectUnreadCount(useNotificationsStore.getState())).toBe(2);
    useNotificationsStore.getState().markAllRead();
    expect(selectUnreadCount(useNotificationsStore.getState())).toBe(0);
  });

  it("clear 清空全部", () => {
    useNotificationsStore.getState().push({ title: "a" });
    useNotificationsStore.getState().clear();
    expect(useNotificationsStore.getState().items).toHaveLength(0);
  });
});
