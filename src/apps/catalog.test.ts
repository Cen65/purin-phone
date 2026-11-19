import { describe, expect, it } from "vitest";
import { parseAppCatalog, CATALOG_TYPE } from "./catalog";

const VALID = JSON.stringify({
  type: CATALOG_TYPE,
  version: 1,
  apps: [
    {
      id: "hello",
      name: "打招唿",
      icon: "👋",
      version: "0.2.0",
      description: "每天说一句",
      category: "tools",
      order: 42,
      blurb: "远程小玩意",
      url: "https://example.com/apps/hello.js",
    },
  ],
});

describe("parseAppCatalog 远程目录解析", () => {
  it("合法目录解析出条目并归一默认值", () => {
    const apps = parseAppCatalog(VALID);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: "hello",
      name: "打招唿",
      icon: "👋",
      version: "0.2.0",
      category: "tools",
      order: 42,
      url: "https://example.com/apps/hello.js",
    });
  });

  it("缺字段的条目给默认值（icon/category/order/version）", () => {
    const apps = parseAppCatalog(
      JSON.stringify({ type: CATALOG_TYPE, apps: [{ id: "bare", name: "裸条目", url: "http://x.dev/a.js" }] }),
    );
    expect(apps[0]?.icon).toBe("📦");
    expect(apps[0]?.category).toBe("tools");
    expect(apps[0]?.order).toBe(100);
    expect(apps[0]?.version).toBe("0.0.0");
  });

  it("非法条目被跳过而不是整体失败", () => {
    const apps = parseAppCatalog(
      JSON.stringify({
        type: CATALOG_TYPE,
        apps: [
          { id: "BAD_ID", name: "x", url: "https://a.b/c.js" }, // id 大写非法
          { id: "no-url", name: "x" }, // 缺 url
          { id: "no-name", url: "https://a.b/c.js" }, // 缺 name
          "not-an-object",
          { id: "fine", name: "ok", url: "https://a.b/d.js" },
        ],
      }),
    );
    expect(apps.map((a) => a.id)).toEqual(["fine"]);
  });

  it("非 JSON 或 type 不对抛错", () => {
    expect(() => parseAppCatalog("not json")).toThrow("应用目录不是有效的 JSON");
    expect(() => parseAppCatalog("{}")).toThrow("应用目录格式不正确");
    expect(() => parseAppCatalog(JSON.stringify({ type: "other", apps: [] }))).toThrow("应用目录格式不正确");
  });
});
