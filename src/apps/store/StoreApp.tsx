import { EXTENSIONS, installApp, uninstallApp } from "../extensions";
import { useAppManagerStore } from "../../state/appManagerStore";
import { bus } from "../../core/events";
import type { AppProps } from "../types";

const CATEGORY_LABELS: Record<string, string> = {
  system: "系统",
  social: "社交",
  tools: "工具",
  media: "媒体",
  game: "游戏",
};

/** 应用商店：浏览扩展应用，安装上桌面、卸载下架。 */
export default function StoreApp(_props: AppProps) {
  const installed = useAppManagerStore((s) => s.installed);
  const entries = Object.values(EXTENSIONS).sort(
    (a, b) => (a.manifest.order ?? 100) - (b.manifest.order ?? 100),
  );
  const installedList = entries.filter((e) => installed.includes(e.manifest.id));
  const availableList = entries.filter((e) => !installed.includes(e.manifest.id));

  return (
    <div className="store">
      <div className="store-hero">
        <div className="store-hero-icon">🛍️</div>
        <div>
          <div className="store-hero-title">Purin 应用商店</div>
          <div className="store-hero-sub">基础能力在桌面，扩展按需安装</div>
        </div>
      </div>

      {installedList.length > 0 && (
        <div className="store-section">
          <div className="store-section-title">已安装（{installedList.length}）</div>
          {installedList.map((def) => (
            <StoreRow key={def.manifest.id} def={def} installed onUninstall={() => runUninstall(def)} />
          ))}
        </div>
      )}

      <div className="store-section">
        <div className="store-section-title">可安装（{availableList.length}）</div>
        {availableList.length === 0 && <div className="store-empty">都装上啦，没有更多了～</div>}
        {availableList.map((def) => (
          <StoreRow key={def.manifest.id} def={def} installed={false} onInstall={() => runInstall(def)} />
        ))}
      </div>

      <div className="store-foot">卸载不会删除应用数据，重新安装即可恢复。</div>
    </div>
  );
}

function runInstall(def: (typeof EXTENSIONS)[string]) {
  const ok = installApp(def.manifest.id);
  bus.emit("notify", {
    appId: "store",
    title: ok ? `已安装「${def.manifest.name}」` : `安装失败：${def.manifest.name}`,
    body: ok ? "图标已放到桌面" : "这个应用不在货架上",
  });
}

function runUninstall(def: (typeof EXTENSIONS)[string]) {
  const name = def.manifest.name;
  const yes = window.confirm(`卸载「${name}」？\n图标会从桌面消失，数据保留，重新安装可恢复。`);
  if (!yes) return;
  uninstallApp(def.manifest.id);
  bus.emit("notify", { appId: "store", title: `已卸载「${name}」`, body: "数据保留，随时可以装回来" });
}

function StoreRow({
  def,
  installed,
  onInstall,
  onUninstall,
}: {
  def: (typeof EXTENSIONS)[string];
  installed: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
}) {
  const m = def.manifest;
  return (
    <div className="store-row">
      <div className="store-row-icon">{m.icon}</div>
      <div className="store-row-main">
        <div className="store-row-name">
          {m.name}
          <span className="store-row-meta">v{m.version}</span>
          <span className="store-row-meta">{CATEGORY_LABELS[m.category ?? "tools"] ?? "工具"}</span>
        </div>
        <div className="store-row-blurb">{def.blurb}</div>
      </div>
      {installed ? (
        <button type="button" className="store-btn store-btn-remove" onClick={onUninstall}>
          卸载
        </button>
      ) : (
        <button type="button" className="store-btn" onClick={onInstall}>
          安装
        </button>
      )}    </div>
  );
}
