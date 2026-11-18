import { getApp } from "../apps/registry";
import { usePhoneStore } from "../state/phoneStore";
import { AppErrorBoundary } from "./AppErrorBoundary";

/** App 宿主：渲染当前打开的应用，提供标题栏 / 返回 / 错误隔离。 */
export function AppHost() {
  const activeAppId = usePhoneStore((s) => s.activeAppId);
  const goHome = usePhoneStore((s) => s.goHome);
  if (!activeAppId) return null;

  const app = getApp(activeAppId);
  if (!app) {
    return (
      <div className="app-host">
        <div className="app-error">
          <p className="app-error-title">应用不存在：{activeAppId}</p>
        </div>
      </div>
    );
  }

  const Content = app.component;
  const fullscreen = app.chrome === "fullscreen";

  return (
    <div className="app-host">
      <AppErrorBoundary appName={app.name}>
        {fullscreen ? (
          <Content appId={app.id} />
        ) : (
          <>
            <header className="app-header">
              <button type="button" className="icon-btn" onClick={goHome} aria-label="回到桌面">
                ‹
              </button>
              <div className="app-header-title">
                <span>{app.icon}</span>
                <span>{app.name}</span>
              </div>
              <span className="icon-btn ghost" aria-hidden="true" />
            </header>
            <div className="app-body">
              <Content appId={app.id} />
            </div>
          </>
        )}
      </AppErrorBoundary>
    </div>
  );
}
