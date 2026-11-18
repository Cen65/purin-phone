import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerBuiltinApps } from "./apps/builtin";
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

  // 1. 注册内置 App（未来：这里也是加载第三方 App 的位置）
  registerBuiltinApps();

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

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
