import { describe, expect, it } from "vitest";
import { EXTENSIONS, installApp, uninstallApp, registerInstalledExtensions } from "./extensions";
import { getApp, getApps } from "./registry";
import { useAppManagerStore } from "../state/appManagerStore";
import { usePhoneStore } from "../state/phoneStore";

describe("扩展目录与安装/卸载", () => {
  it("目录收录五个扩展，字段完整", () => {
    expect(Object.keys(EXTENSIONS).sort()).toEqual(["anniversary", "moments", "notes", "weather", "worldbook"]);
    for (const def of Object.values(EXTENSIONS)) {
      expect(def.manifest.id.length).toBeGreaterThan(0);
      expect(typeof def.load).toBe("function");
      expect(def.blurb.length).toBeGreaterThan(0);
    }
  });

  it("默认预装 moments/notes/worldbook，registerInstalledExtensions 装回", () => {
    expect(useAppManagerStore.getState().installed).toEqual(["moments", "notes", "worldbook"]);
    registerInstalledExtensions();
    expect(getApp("moments")).toBeDefined();
    expect(getApp("notes")).toBeDefined();
    expect(getApp("worldbook")).toBeDefined();
    // 基础 App 未被目录动过
    expect(getApp("weather")).toBeUndefined();
  });

  it("安装：注册表出现图标并记录；重复安装返回 false", () => {
    expect(installApp("weather")).toBe(true);
    expect(getApps().some((app) => app.id === "weather")).toBe(true);
    expect(useAppManagerStore.getState().installed).toContain("weather");
    expect(installApp("weather")).toBe(false);
  });

  it("卸载：图标消失、清角标、正打开则回桌面；数据记录移除", () => {
    usePhoneStore.setState({ activeAppId: "weather", badges: { weather: 3 } });
    uninstallApp("weather");
    expect(getApp("weather")).toBeUndefined();
    expect(useAppManagerStore.getState().installed).not.toContain("weather");
    expect(usePhoneStore.getState().badges["weather"]).toBeUndefined();
    expect(usePhoneStore.getState().activeAppId).toBeNull();
  });

  it("未上架的 id 安装失败", () => {
    expect(installApp("not-in-catalog")).toBe(false);
  });
});
