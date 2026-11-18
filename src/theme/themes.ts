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

/** 布丁（P3 品牌主题）：焦糖顶 + 奶油身 */
const PURIN_THEME: PhoneTheme = {
  id: "purin",
  label: "布丁",
  mode: "light",
  vars: {
    "c-bg": "#faf5ec",
    "c-surface": "#fffdf8",
    "c-surface-2": "#f3ead9",
    "c-text": "#3a2f22",
    "c-text-dim": "#97836b",
    "c-border": "#eadfc9",
    "c-accent": "#c07f26",
    "c-accent-soft": "#f7e8cf",
    "c-danger": "#d9534f",
    "c-bubble-user": "#c07f26",
    "c-bubble-user-text": "#ffffff",
    "c-bubble-ai": "#fffdf8",
    "home-wall": "linear-gradient(160deg, #f7e3c3 0%, #fbf3e4 45%, #f3e7d3 100%)",
  },
};

/** 夜葡萄（P3）：深紫暗色 */
const GRAPE_THEME: PhoneTheme = {
  id: "grape",
  label: "夜葡萄",
  mode: "dark",
  vars: {
    "c-bg": "#131019",
    "c-surface": "#1c1725",
    "c-surface-2": "#272033",
    "c-text": "#ece8f4",
    "c-text-dim": "#9d93b0",
    "c-border": "#322a41",
    "c-accent": "#b07ae8",
    "c-accent-soft": "#2e2440",
    "c-danger": "#ff6369",
    "c-bubble-user": "#7a4fc0",
    "c-bubble-user-text": "#ffffff",
    "c-bubble-ai": "#1c1725",
    "home-wall": "linear-gradient(160deg, #221a33 0%, #131019 50%, #1a1526 100%)",
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

/* ---------------- 主题包（P3）：JSON 导入 / 导出 ---------------- */

/** 主题包交换格式：与 PhoneTheme 同构 + type/version 标识 */
export interface ThemePack {
  type: "purin.theme";
  version: 1;
  id: string;
  label: string;
  mode: "light" | "dark";
  vars: Record<string, string>;
}

const VAR_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,29}$/;

/** 序列化为主题包 JSON（文件内容由调用方下载） */
export function exportTheme(theme: PhoneTheme): string {
  const pack: ThemePack = {
    type: "purin.theme",
    version: 1,
    id: theme.id,
    label: theme.label,
    mode: theme.mode,
    vars: theme.vars,
  };
  return JSON.stringify(pack, null, 2);
}

/** 解析主题包 JSON → PhoneTheme；格式不对抛 Error("主题包格式不正确") */
export function parseThemePack(json: string): PhoneTheme {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("主题包格式不正确");
  }
  if (!raw || typeof raw !== "object") throw new Error("主题包格式不正确");
  const pack = raw as Partial<ThemePack>;
  if (
    pack.type !== "purin.theme" ||
    typeof pack.id !== "string" ||
    !VAR_KEY_PATTERN.test(pack.id) ||
    typeof pack.label !== "string" ||
    !pack.label.trim() ||
    (pack.mode !== "light" && pack.mode !== "dark") ||
    !pack.vars ||
    typeof pack.vars !== "object"
  ) {
    throw new Error("主题包格式不正确");
  }
  const entries = Object.entries(pack.vars as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 40) throw new Error("主题包格式不正确");
  const vars: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!VAR_KEY_PATTERN.test(key) || typeof value !== "string" || !value.trim()) {
      throw new Error("主题包格式不正确");
    }
    vars[key] = value;
  }
  return {
    id: pack.id,
    label: pack.label.trim().slice(0, 20),
    mode: pack.mode,
    vars,
  };
}

// 注册内置主题
registerTheme(LIGHT_THEME);
registerTheme(DARK_THEME);
registerTheme(MATCHA_THEME);
registerTheme(PURIN_THEME);
registerTheme(GRAPE_THEME);
