/**
 * 主题注册表：主题 = 一组 CSS 变量。
 * registerTheme 注册后即可在设置里选择；第三方主题包未来可以直接复用这个入口。
 * applyTheme 会把变量写到 document.documentElement 上，全局生效。
 */

export interface PhoneTheme {
  id: string;
  label: string;
  /** light | dark，影响状态栏等少量仅按明暗区分的样式 */
  mode: "light" | "dark";
  /** CSS 变量表，key 不带 -- 前缀 */
  vars: Record<string, string>;
}

const themes = new Map<string, PhoneTheme>();

export const LIGHT_THEME: PhoneTheme = {
  id: "light",
  label: "清白",
  mode: "light",
  vars: {
    "c-bg": "#f4f4f6",
    "c-surface": "#ffffff",
    "c-surface-2": "#ececef",
    "c-text": "#1c1c20",
    "c-text-dim": "#7a7a85",
    "c-border": "#e2e2e6",
    "c-accent": "#4f6ef7",
    "c-accent-soft": "#e5eaff",
    "c-danger": "#e5484d",
    "c-bubble-user": "#4f6ef7",
    "c-bubble-user-text": "#ffffff",
    "c-bubble-ai": "#ffffff",
    "home-wall": "linear-gradient(160deg, #dfe6ff 0%, #f6f5fb 45%, #e9f2ee 100%)",
  },
};

export const DARK_THEME: PhoneTheme = {
  id: "dark",
  label: "夜色",
  mode: "dark",
  vars: {
    "c-bg": "#101014",
    "c-surface": "#1b1b21",
    "c-surface-2": "#26262e",
    "c-text": "#ececf1",
    "c-text-dim": "#9a9aa6",
    "c-border": "#2c2c35",
    "c-accent": "#7c93ff",
    "c-accent-soft": "#262c4d",
    "c-danger": "#ff6369",
    "c-bubble-user": "#3d51c9",
    "c-bubble-user-text": "#ffffff",
    "c-bubble-ai": "#1b1b21",
    "home-wall": "linear-gradient(160deg, #171a2b 0%, #101014 50%, #12201c 100%)",
  },
};

const MATCHA_THEME: PhoneTheme = {
  id: "matcha",
  label: "抹茶",
  mode: "light",
  vars: {
    "c-bg": "#f2f5ef",
    "c-surface": "#ffffff",
    "c-surface-2": "#e7eee3",
    "c-text": "#232a22",
    "c-text-dim": "#75816f",
    "c-border": "#dde5d8",
    "c-accent": "#5a8a4e",
    "c-accent-soft": "#e3efdd",
    "c-danger": "#d9534f",
    "c-bubble-user": "#5a8a4e",
    "c-bubble-user-text": "#ffffff",
    "c-bubble-ai": "#ffffff",
    "home-wall": "linear-gradient(160deg, #e2f0dc 0%, #f5f7f0 50%, #eef3e6 100%)",
  },
};

export function registerTheme(theme: PhoneTheme): void {
  themes.set(theme.id, theme);
}

export function getThemes(): PhoneTheme[] {
  return [...themes.values()];
}

export function getTheme(id: string): PhoneTheme | undefined {
  return themes.get(id);
}

export function applyTheme(id: string): void {
  const theme = themes.get(id) ?? LIGHT_THEME;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.dataset.themeMode = theme.mode;
}

// 注册内置主题
registerTheme(LIGHT_THEME);
registerTheme(DARK_THEME);
registerTheme(MATCHA_THEME);
