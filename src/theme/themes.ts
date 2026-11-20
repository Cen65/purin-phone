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
    "home-wall": "linear-gradient(160deg, #d9e2ff 0%, #f6f5fb 42%, #e9f2ee 72%, #f8f7f2 100%)",
    glass: "rgba(255, 255, 255, 0.62)",
    "glass-strong": "rgba(255, 255, 255, 0.78)",
    "glass-border": "rgba(255, 255, 255, 0.65)",
    "home-glow":
      "radial-gradient(130% 75% at 18% 0%, rgba(255, 255, 255, 0.55), transparent 62%), radial-gradient(110% 65% at 92% 100%, rgba(79, 110, 247, 0.16), transparent 68%)",
    stage:
      "radial-gradient(1100px 750px at 12% -8%, rgba(198, 210, 255, 0.7), transparent 62%), radial-gradient(900px 650px at 105% 108%, rgba(206, 226, 214, 0.65), transparent 60%), linear-gradient(165deg, #eef0f7 0%, #e9edf3 55%, #e7ece9 100%)",
    "frame-shadow":
      "0 30px 80px rgba(70, 84, 128, 0.28), 0 8px 24px rgba(70, 84, 128, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.45)",
    "stage-tint-a": "#2b3150",
    "stage-tint-b": "#14161f",
  },
};

/** 樱粉（默认主题）：参考应用图标的粉色系——樱花粉 + 奶油白 + 玫瑰点缀 */
export const SAKURA_THEME: PhoneTheme = {
  id: "sakura",
  label: "樱粉",
  mode: "light",
  vars: {
    "c-bg": "#fdf2f5",
    "c-surface": "#ffffff",
    "c-surface-2": "#fae7ed",
    "c-text": "#432e38",
    "c-text-dim": "#a68792",
    "c-border": "#f4dae1",
    "c-accent": "#ec5f92",
    "c-accent-soft": "#fde5ed",
    "c-danger": "#e5484d",
    "c-bubble-user": "#ec5f92",
    "c-bubble-user-text": "#ffffff",
    "c-bubble-ai": "#ffffff",
    "home-wall": "linear-gradient(160deg, #ffd7e4 0%, #fff8f4 40%, #fdeff4 72%, #fff9f7 100%)",
    glass: "rgba(255, 255, 255, 0.6)",
    "glass-strong": "rgba(255, 255, 255, 0.8)",
    "glass-border": "rgba(255, 255, 255, 0.66)",
    "home-glow":
      "radial-gradient(130% 75% at 18% 0%, rgba(255, 255, 255, 0.55), transparent 62%), radial-gradient(110% 65% at 92% 100%, rgba(236, 95, 146, 0.18), transparent 68%)",
    stage:
      "radial-gradient(1100px 750px at 12% -8%, rgba(255, 193, 214, 0.75), transparent 62%), radial-gradient(900px 650px at 105% 108%, rgba(255, 224, 202, 0.7), transparent 60%), linear-gradient(165deg, #ffe9f0 0%, #fdf0ec 55%, #f9e6ee 100%)",
    "frame-shadow":
      "0 30px 80px rgba(190, 90, 125, 0.30), 0 8px 24px rgba(190, 90, 125, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.5)",
    "stage-tint-a": "#d97a9b",
    "stage-tint-b": "#f3d9e2",
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
    "home-wall": "linear-gradient(160deg, #1a1f38 0%, #101014 48%, #0f1d1a 78%, #121318 100%)",
    glass: "rgba(24, 24, 32, 0.55)",
    "glass-strong": "rgba(24, 24, 32, 0.74)",
    "glass-border": "rgba(255, 255, 255, 0.09)",
    "home-glow":
      "radial-gradient(130% 75% at 18% 0%, rgba(255, 255, 255, 0.07), transparent 62%), radial-gradient(110% 65% at 92% 100%, rgba(124, 147, 255, 0.14), transparent 68%)",
    stage:
      "radial-gradient(1100px 750px at 10% -8%, rgba(64, 84, 160, 0.35), transparent 62%), radial-gradient(900px 650px at 108% 106%, rgba(38, 96, 84, 0.28), transparent 60%), linear-gradient(165deg, #15171f 0%, #0e0f14 55%, #0d1210 100%)",
    "frame-shadow":
      "0 30px 90px rgba(0, 0, 0, 0.62), 0 6px 22px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
    "stage-tint-a": "#1c2440",
    "stage-tint-b": "#0d0e13",
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
    "home-wall": "linear-gradient(160deg, #dceed4 0%, #f5f7f0 45%, #edf3e4 75%, #f7f9f2 100%)",
    glass: "rgba(255, 255, 255, 0.6)",
    "glass-strong": "rgba(255, 255, 255, 0.78)",
    "glass-border": "rgba(255, 255, 255, 0.66)",
    "home-glow":
      "radial-gradient(130% 75% at 18% 0%, rgba(255, 255, 255, 0.5), transparent 62%), radial-gradient(110% 65% at 92% 100%, rgba(90, 138, 78, 0.16), transparent 68%)",
    stage:
      "radial-gradient(1100px 750px at 12% -8%, rgba(196, 226, 186, 0.7), transparent 62%), radial-gradient(900px 650px at 105% 108%, rgba(222, 232, 200, 0.65), transparent 60%), linear-gradient(165deg, #eef3e9 0%, #edf2e8 55%, #e9f0e4 100%)",
    "frame-shadow":
      "0 30px 80px rgba(84, 108, 74, 0.26), 0 8px 24px rgba(84, 108, 74, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.45)",
    "stage-tint-a": "#2c3a2c",
    "stage-tint-b": "#101410",
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
    "home-wall": "linear-gradient(160deg, #f5dfba 0%, #fbf3e4 42%, #f3e7d3 74%, #faf4e8 100%)",
    glass: "rgba(255, 251, 242, 0.62)",
    "glass-strong": "rgba(255, 251, 242, 0.8)",
    "glass-border": "rgba(255, 255, 255, 0.6)",
    "home-glow":
      "radial-gradient(130% 75% at 18% 0%, rgba(255, 255, 255, 0.55), transparent 62%), radial-gradient(110% 65% at 92% 100%, rgba(192, 127, 38, 0.16), transparent 68%)",
    stage:
      "radial-gradient(1100px 750px at 12% -8%, rgba(250, 219, 176, 0.75), transparent 62%), radial-gradient(900px 650px at 105% 108%, rgba(246, 226, 198, 0.7), transparent 60%), linear-gradient(165deg, #f8efe2 0%, #f7edde 55%, #f4e9d8 100%)",
    "frame-shadow":
      "0 30px 80px rgba(150, 104, 44, 0.26), 0 8px 24px rgba(150, 104, 44, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.5)",
    "stage-tint-a": "#4a3520",
    "stage-tint-b": "#17110a",
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
    "home-wall": "linear-gradient(160deg, #261c3a 0%, #131019 48%, #191426 78%, #151221 100%)",
    glass: "rgba(26, 20, 38, 0.55)",
    "glass-strong": "rgba(26, 20, 38, 0.74)",
    "glass-border": "rgba(255, 255, 255, 0.08)",
    "home-glow":
      "radial-gradient(130% 75% at 18% 0%, rgba(255, 255, 255, 0.06), transparent 62%), radial-gradient(110% 65% at 92% 100%, rgba(176, 122, 232, 0.15), transparent 68%)",
    stage:
      "radial-gradient(1100px 750px at 10% -8%, rgba(94, 62, 148, 0.4), transparent 62%), radial-gradient(900px 650px at 108% 106%, rgba(60, 40, 100, 0.3), transparent 60%), linear-gradient(165deg, #171320 0%, #100d17 55%, #0f0c15 100%)",
    "frame-shadow":
      "0 30px 90px rgba(0, 0, 0, 0.64), 0 6px 22px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
    "stage-tint-a": "#2a1f45",
    "stage-tint-b": "#0e0b16",
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
registerTheme(SAKURA_THEME);
registerTheme(DARK_THEME);
registerTheme(MATCHA_THEME);
registerTheme(PURIN_THEME);
registerTheme(GRAPE_THEME);
