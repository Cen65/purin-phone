/**
 * 统一风格的 SVG 图标集（线性圆角风格，currentColor 跟随文字颜色）
 * + App 渐变磁贴（iOS 式圆角方块，替代各平台渲染不一致的 emoji 图标）。
 * 远程/未知 App 没有磁贴定义时回退 emoji。
 */
import type { ReactNode } from "react";

export type IconName =
  | "chat"
  | "contacts"
  | "notes"
  | "settings"
  | "store"
  | "moments"
  | "worldbook"
  | "weather"
  | "anniversary"
  | "bell"
  | "lock"
  | "mic"
  | "send"
  | "back"
  | "plus"
  | "search"
  | "image"
  | "heart"
  | "comment"
  | "phone"
  | "phone-off"
  | "trash"
  | "download"
  | "stop"
  | "sparkle"
  | "x"
  | "eye"
  | "volume"
  | "refresh"
  | "globe"
  | "copy"
  | "check"
  | "info"
  | "edit"
  | "home";

const PATHS: Record<IconName, ReactNode> = {
  chat: <path d="M21 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 4V5.5A2.5 2.5 0 0 1 6.5 3h12A2.5 2.5 0 0 1 21 5.5z" />,
  contacts: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c0-3.9 3.4-6.2 7.5-6.2s7.5 2.3 7.5 6.2" />
    </>
  ),
  notes: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h8M16 7h4M4 12h2M10 12h10M4 17h12M20 17h1" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="17" r="2" />
    </>
  ),
  store: (
    <>
      <path d="M6 8h12l-1 11.2a2 2 0 0 1-2 1.8H9a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  moments: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="5.2" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  worldbook: (
    <>
      <path d="M12 6.2C10.4 4.9 8.2 4.2 6 4.2v13.6c2.2 0 4.4.7 6 2 1.6-1.3 3.8-2 6-2V4.2c-2.2 0-4.4.7-6 2z" />
      <path d="M12 6.2v13.6" />
    </>
  ),
  weather: (
    <>
      <circle cx="7.5" cy="7.5" r="2.6" />
      <path d="M7.5 2.8v1.2M2.8 7.5H4M4.2 4.2l.9.9M10.8 4.2l-.9.9" />
      <path d="M18 19.5H7.2a4 4 0 0 1-.7-7.9 5.6 5.6 0 0 1 10.7-1.4 4.5 4.5 0 0 1 .8 9.3z" />
    </>
  ),
  anniversary: (
    <path d="M12 20.3s-7.4-4.6-9.2-8.9A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.2 5c-1.8 4.3-9.2 8.9-9.2 8.9z" />
  ),
  bell: (
    <>
      <path d="M18 9.2a6 6 0 1 0-12 0c0 6.8-2.4 7.8-2.4 7.8h16.8S18 16 18 9.2z" />
      <path d="M10.2 20.3a2 2 0 0 0 3.6 0" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  mic: (
    <>
      <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
    </>
  ),
  send: (
    <>
      <path d="M21.5 2.5 10.8 13.2" />
      <path d="M21.5 2.5 15 21l-4.2-7.8L3 9z" />
    </>
  ),
  back: <path d="M14.5 4.5 7 12l7.5 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5 16.2 16.2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M4.5 17.5 9 13l3.5 3.5 3-3 4 4" />
    </>
  ),
  heart: (
    <path d="M12 20.3s-7.4-4.6-9.2-8.9A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.2 5c-1.8 4.3-9.2 8.9-9.2 8.9z" />
  ),
  comment: (
    <path d="M21 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 4V5.5A2.5 2.5 0 0 1 7.5 3h11A2.5 2.5 0 0 1 21 5.5z" />
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8 10a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
  ),
  "phone-off": (
    <>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8 10a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
      <path d="M2.5 2.5 21.5 21.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7 10.5 12 15.5 17 10.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  sparkle: (
    <>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
      <path d="M18.8 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6L21 9.2" />
      <path d="M21 4v5.2h-5.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.3 4 5.2 4 8.5s-1.4 6.2-4 8.5c-2.6-2.3-4-5.2-4-8.5s1.4-6.2 4-8.5z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
      <path d="M5.5 14.5h-1A1.5 1.5 0 0 1 3 13V4a1.5 1.5 0 0 1 1.5-1.5H13A1.5 1.5 0 0 1 14.5 4v1" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.8h.01" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  home: (
    <>
      <path d="M4.5 10.5 12 4l7.5 6.5" />
      <path d="M6.5 9.7V20h11V9.7" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---------------- App 渐变磁贴 ---------------- */

interface TileDef {
  icon: IconName;
  from: string;
  to: string;
}

/** 内置 App 的磁贴渐变（亮→深 135°，粉系调和的柔和配色）；远程/未知 App 回退 emoji */
const APP_TILES: Record<string, TileDef> = {
  chat: { icon: "chat", from: "#8aa8ff", to: "#5f7df2" },
  contacts: { icon: "contacts", from: "#7fdcc2", to: "#3fbd97" },
  notes: { icon: "notes", from: "#ffdd9a", to: "#f6ad55" },
  settings: { icon: "settings", from: "#c3b9d4", to: "#9d92b8" },
  store: { icon: "store", from: "#c9a9ff", to: "#9a6df0" },
  moments: { icon: "moments", from: "#ff9db9", to: "#f2608f" },
  worldbook: { icon: "worldbook", from: "#aee6a3", to: "#69bf74" },
  weather: { icon: "weather", from: "#96d9f9", to: "#54b5e3" },
  anniversary: { icon: "anniversary", from: "#ffb49c", to: "#f57f5a" },
};

export function AppTileIcon({ appId, emoji, size = 56 }: { appId: string; emoji: string; size?: number }) {
  const tile = APP_TILES[appId];
  if (!tile) {
    return (
      <span className="app-tile app-tile-fallback" style={{ width: size, height: size }}>
        <span style={{ fontSize: Math.round(size * 0.46), lineHeight: 1 }}>{emoji}</span>
      </span>
    );
  }
  return (
    <span
      className="app-tile"
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(135deg, ${tile.from} 0%, ${tile.to} 100%)`,
      }}
    >
      <Icon name={tile.icon} size={Math.round(size * 0.5)} strokeWidth={1.9} className="app-tile-glyph" />
    </span>
  );
}
