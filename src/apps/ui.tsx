import { useEffect, useState, type ReactNode } from "react";
import { loadImage } from "../core/imageStore";

/** App 内共享的小 UI 件，样式见 global.css */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}

/** 异步图片：从 IndexedDB 图片仓懒加载（聊天图片 / 朋友圈配图共用）；加载前不占位，失败静默 */
export function AsyncImage({ imageId, className, alt }: { imageId: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    void loadImage(imageId).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);
  if (!src) return null;
  return <img className={className} src={src} alt={alt ?? ""} loading="lazy" />;
}
