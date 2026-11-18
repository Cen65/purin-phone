import { describe, it, expect } from "vitest";
import { getThemes, registerTheme, exportTheme, parseThemePack, type PhoneTheme } from "./themes";

describe("主题注册表", () => {
  it("内置主题包含 P3 新增的布丁与夜葡萄", () => {
    const ids = getThemes().map((theme) => theme.id);
    expect(ids).toContain("purin");
    expect(ids).toContain("grape");
  });
});

describe("主题包导出 / 导入", () => {
  it("exportTheme → parseThemePack roundtrip", () => {
    const source = getThemes().find((theme) => theme.id === "grape")!;
    const pack = parseThemePack(exportTheme(source));
    expect(pack.id).toBe("grape");
    expect(pack.label).toBe("夜葡萄");
    expect(pack.mode).toBe("dark");
    expect(pack.vars["c-accent"]).toBe(source.vars["c-accent"]);
  });

  it("非法主题包抛「主题包格式不正确」", () => {
    expect(() => parseThemePack("not json")).toThrow("主题包格式不正确");
    expect(() => parseThemePack("{}")).toThrow("主题包格式不正确");
    // type 不对
    expect(() =>
      parseThemePack(JSON.stringify({ type: "other", id: "x", label: "x", mode: "light", vars: { "c-bg": "#fff" } })),
    ).toThrow("主题包格式不正确");
    // 变量名不合法（大写）
    expect(() =>
      parseThemePack(JSON.stringify({ type: "purin.theme", id: "x", label: "x", mode: "light", vars: { "C-BG": "#fff" } })),
    ).toThrow("主题包格式不正确");
    // 变量值为空
    expect(() =>
      parseThemePack(JSON.stringify({ type: "purin.theme", id: "x", label: "x", mode: "light", vars: { "c-bg": " " } })),
    ).toThrow("主题包格式不正确");
  });

  it("注册自定义主题后 getThemes 可见（导出→导入→注册 roundtrip）", () => {
    const custom: PhoneTheme = {
      id: "test-theme",
      label: "测试",
      mode: "light",
      vars: { "c-bg": "#ffffff", "c-accent": "#123456" },
    };
    const pack = parseThemePack(exportTheme(custom));
    expect(pack.id).toBe("test-theme");
    registerTheme(pack);
    expect(getThemes().map((theme) => theme.id)).toContain("test-theme");
  });
});
