import { describe, expect, it } from "vitest";
import { EXTENSIONS, installApp, uninstallApp, registerInstalledExtensions, installRemoteApp, isReservedAppId } from "./extensions";
import { getApp, getApps } from "./registry";
import { useAppManagerStore } from "../state/appManagerStore";
import { usePhoneStore } from "../state/phoneStore";

const REMOTE_APP = {
  id: "hello-remote",
  name: "远程示例",
  icon: "👋",
  version: "0.1.0",
  description: "远程目录里的示例应用",
  category: "tools" as const,
  order: 80,
  blurb: "远程示例",
  url: "https://example.com/purin-apps/hello/index.js",
};

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

  it("远程应用：安装后注册表可见并持久化入口；卸载一并清理", () => {
    expect(installRemoteApp(REMOTE_APP)).toBe(true);
    expect(getApp("hello-remote")?.name).toBe("远程示例");
    expect(useAppManagerStore.getState().remote["hello-remote"]?.url).toBe(REMOTE_APP.url);
    expect(installRemoteApp(REMOTE_APP)).toBe(false); // 重复安装拒绝
    uninstallApp("hello-remote");
    expect(getApp("hello-remote")).toBeUndefined();
    expect(useAppManagerStore.getState().remote["hello-remote"]).toBeUndefined();
  });

  it("远程应用不允许覆盖本地货架 id", () => {
    expect(installRemoteApp({ ...REMOTE_APP, id: "weather" })).toBe(false);
    expect(isReservedAppId("moments")).toBe(true); // 已注册的本地扩展
    expect(isReservedAppId("brand-new-id")).toBe(false);
  });
});
