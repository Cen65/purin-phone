import type { ComponentType } from "react";

/** 每个 App 收到的 props */
export interface AppProps {
  appId: string;
}

/**
 * App 清单：注册即上桌面。
 * 这是整个项目最重要的扩展点——新功能以 App 形式加入，不改动系统代码。
 */
export interface AppManifest {
  /** 全局唯一 id（同时是桌面对位、路由、角标 key） */
  id: string;
  name: string;
  /** emoji 或图片 URL */
  icon: string;
  version: string;
  description?: string;
  category?: "system" | "social" | "tools" | "media" | "game";
  /** default = 系统标题栏；fullscreen = 自绘整个区域 */
  chrome?: "default" | "fullscreen";
  /** 桌面排序权重，小的靠前，默认 100 */
  order?: number;
  component: ComponentType<AppProps>;
}
