import { describe, expect, it } from "vitest";
import { usePhoneStore } from "./phoneStore";

/** 手机状态（P2 新增锁屏）：lock/unlock 与角标清理。 */
describe("phoneStore", () => {
  it("lock/unlock 切换锁屏状态", () => {
    usePhoneStore.getState().lock();
    expect(usePhoneStore.getState().locked).toBe(true);
    usePhoneStore.getState().unlock();
    expect(usePhoneStore.getState().locked).toBe(false);
  });

  it("openApp 切换应用并清空该应用角标", () => {
    usePhoneStore.getState().bumpBadge("chat");
    usePhoneStore.getState().bumpBadge("chat");
    expect(usePhoneStore.getState().badges.chat).toBe(2);
    usePhoneStore.getState().openApp("chat");
    expect(usePhoneStore.getState().activeAppId).toBe("chat");
    expect(usePhoneStore.getState().badges.chat).toBe(0);
  });

  it("goHome 回桌面（activeAppId 置空）", () => {
    usePhoneStore.getState().openApp("notes");
    usePhoneStore.getState().goHome();
    expect(usePhoneStore.getState().activeAppId).toBeNull();
    expect(usePhoneStore.getState().params).toEqual({});
  });
});
