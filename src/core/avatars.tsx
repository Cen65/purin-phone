/**
 * 头像渲染：支持两类 avatar 字段值——
 *  1. "svg:<name>"：内置矢量头像（如布丁兔），任何分辨率都清晰、随主题配色
 *  2. 其他任意字符串：按 emoji/文字渲染（角色卡兼容）
 */
import type { CSSProperties, ReactNode } from "react";

/** 布丁兔：粉色系吉祥物（樱花粉耳朵 + 腮红） */
export function BunnyAvatar({ size = 40, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* 耳朵 */}
      <g>
        <ellipse cx="22.5" cy="17" rx="6.2" ry="13.5" fill="#ffeef4" stroke="#f2c7d8" strokeWidth="1.4" transform="rotate(-9 22.5 17)" />
        <ellipse cx="22.5" cy="18" rx="2.9" ry="8.4" fill="#ffb8cd" transform="rotate(-9 22.5 18)" />
        <ellipse cx="41.5" cy="17" rx="6.2" ry="13.5" fill="#ffeef4" stroke="#f2c7d8" strokeWidth="1.4" transform="rotate(9 41.5 17)" />
        <ellipse cx="41.5" cy="18" rx="2.9" ry="8.4" fill="#ffb8cd" transform="rotate(9 41.5 18)" />
      </g>
      {/* 脸 */}
      <circle cx="32" cy="41" r="17.5" fill="#fffaf6" stroke="#f2c7d8" strokeWidth="1.4" />
      {/* 眼睛 */}
      <circle cx="25.6" cy="39.5" r="2.1" fill="#5a4048" />
      <circle cx="38.4" cy="39.5" r="2.1" fill="#5a4048" />
      <circle cx="26.3" cy="38.8" r="0.6" fill="#fff" />
      <circle cx="39.1" cy="38.8" r="0.6" fill="#fff" />
      {/* 腮红 */}
      <ellipse cx="21.8" cy="44.8" rx="3.2" ry="2" fill="#ffc9d9" />
      <ellipse cx="42.2" cy="44.8" rx="3.2" ry="2" fill="#ffc9d9" />
      {/* 鼻子 + 嘴 */}
      <ellipse cx="32" cy="43.2" rx="1.5" ry="1.1" fill="#f08cab" />
      <path d="M32 44.3q-1.6 2.6-3.8 1M32 44.3q1.6 2.6 3.8 1" fill="none" stroke="#5a4048" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const SVG_AVATARS: Record<string, (props: { size?: number; className?: string; style?: CSSProperties }) => ReactNode> = {
  bunny: BunnyAvatar,
};

/** 统一头像出口：所有显示角色头像的地方都用它，emoji 与矢量头像无缝混排 */
export function AvatarView({
  avatar,
  size = 40,
  className,
  style,
}: {
  avatar?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const token = avatar?.startsWith("svg:") ? avatar.slice(4) : "";
  const Svg = SVG_AVATARS[token];
  if (Svg) return <Svg size={size} className={className} style={style} />;
  return (
    <span
      className={className}
      style={{ fontSize: Math.round(size * 0.62), width: size, height: size, display: "inline-grid", placeItems: "center", lineHeight: 1, ...style }}
    >
      {avatar || "🙂"}
    </span>
  );
}
