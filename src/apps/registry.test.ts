import { describe, expect, it } from "vitest";
import { registerApp, unregisterApp, getApp, getApps } from "./registry";

function makeApp(id: string, order?: number) {
  return {
    id,
    name: id,
    icon: "📦",
    version: "0.0.1",
    order,
    component: () => null,
  };
}

describe("app registry", () => {
  it("注册后可以按 id 获取", () => {
    registerApp(makeApp("test-a"));
    expect(getApp("test-a")?.id).toBe("test-a");
    unregisterApp("test-a");
    expect(getApp("test-a")).toBeUndefined();
  });

  it("重复注册相同 id 抛错", () => {
    registerApp(makeApp("test-dup"));
    expect(() => registerApp(makeApp("test-dup"))).toThrow(/重复/);
    unregisterApp("test-dup");
  });

  it("getApps 按 order 升序、无 order 时按名称排序", () => {
    registerApp(makeApp("z-late", 200));
    registerApp(makeApp("m-early", 1));
    registerApp(makeApp("b-default"));
    registerApp(makeApp("a-default"));
    const ids = getApps().map((app) => app.id);
    expect(ids.indexOf("m-early")).toBeLessThan(ids.indexOf("b-default"));
    expect(ids.indexOf("b-default")).toBeGreaterThan(ids.indexOf("a-default"));
    expect(ids.indexOf("z-late")).toBeGreaterThan(ids.indexOf("b-default"));
    unregisterApp("z-late");
    unregisterApp("m-early");
    unregisterApp("b-default");
    unregisterApp("a-default");
  });
});
