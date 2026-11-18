import { getApps } from "../apps/registry";
import { usePhoneStore } from "../state/phoneStore";
import { useSettingsStore, isApiReady } from "../state/settingsStore";

/** 桌面：应用网格 + 底部 Dock。App 列表完全来自注册表。 */
export function HomeScreen() {
  const openApp = usePhoneStore((s) => s.openApp);
  const badges = usePhoneStore((s) => s.badges);
  const api = useSettingsStore((s) => s.api);

  const apps = getApps();
  const dockIds = ["chat", "contacts"];
  const gridApps = apps.filter((app) => !dockIds.includes(app.id));
  const dockApps = dockIds
    .map((id) => apps.find((app) => app.id === id))
    .filter((app) => app !== undefined);

  return (
    <div className="home-screen">
      <div className="home-header">
        <div className="home-date">
          {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
        </div>
        {!isApiReady(api) && (
          <button type="button" className="home-hint" onClick={() => openApp("settings")}>
            ⚙️ 还没配置 AI 服务，点这里去设置
          </button>
        )}
      </div>
      <div className="home-grid">
        {gridApps.map((app) => (
          <button
            type="button"
            key={app.id}
            className="home-app"
            onClick={() => openApp(app.id)}
            title={app.description ?? app.name}
          >
            <span className="home-app-icon">
              <span className="home-app-emoji">{app.icon}</span>
              {(badges[app.id] ?? 0) > 0 && <span className="home-app-badge">{badges[app.id]}</span>}
            </span>
            <span className="home-app-name">{app.name}</span>
          </button>
        ))}
      </div>
      <div className="home-dock">
        {dockApps.map((app) => (
          <button
            type="button"
            key={app.id}
            className="dock-app"
            onClick={() => openApp(app.id)}
            title={app.name}
          >
            <span className="home-app-emoji">{app.icon}</span>
            {(badges[app.id] ?? 0) > 0 && <span className="home-app-badge">{badges[app.id]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
