import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerBuiltinApps } from "./apps/builtin";
import { registerInstalledExtensions } from "./apps/extensions";
import { ensureSeed } from "./state/seed";
import { useSettingsStore } from "./state/settingsStore";
import { useNotificationsStore } from "./state/notificationsStore";
import { initDeeplink } from "./state/phoneStore";
import { applyTheme } from "./theme/themes";
import { loadCommercialConfig } from "./core/config";
import {
  registerEntitlementProvider,
  setActiveEntitlementProvider,
} from "./core/entitlement";
import { createLicenseServerProvider } from "./core/licenseServerProvider";
import { bus } from "./core/events";
import "./styles/global.css";

async function bootstrap(): Promise<void> {
  // 0. 商用开关：commercial.json 里 mode=licensed 时启用激活码授权
  const commercial = await loadCommercialConfig();
  if (commercial.mode === "licensed") {
    registerEntitlementProvider(createLicenseServerProvider(commercial.licenseServer));
    setActiveEntitlementProvider("license-server");
  }

  // 1. 注册基础 App + 按安装列表装回扩展 App（应用商店）
  registerBuiltinApps();
  registerInstalledExtensions();

  // 2. 首次启动种子数据
  ensureSeed();

  // 3. 应用已保存的主题，并跟随设置变化
  applyTheme(useSettingsStore.getState().themeId);
  useSettingsStore.subscribe((state) => applyTheme(state.themeId));

  // 4. 系统事件接线：notify → 通知中心收件箱（P2）
  bus.on("notify", (event) => {
    useNotificationsStore.getState().push({
      appId: event.appId,
      title: event.title,
      body: event.body,
      kind: event.kind ?? "info",
    });
  });

  // 5. hash 深链：地址栏 ↔ 打开的 App 双向同步
  initDeeplink();

  // 6. PWA：生产构建注册 Service Worker（缓存静态壳，断网可开；commercial.json 永远走网络）
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("[pwa] Service Worker 注册失败", error);
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
