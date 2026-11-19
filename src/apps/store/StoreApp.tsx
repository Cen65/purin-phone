import { useEffect, useState } from "react";
import { EXTENSIONS, installApp, installRemoteApp, uninstallApp, isReservedAppId } from "../extensions";
import type { CatalogApp } from "../catalog";
import { parseAppCatalog } from "../catalog";
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

/** 应用商店：浏览扩展应用，安装上桌面、卸载下架；也支持从远程目录装第三方 App。 */
export default function StoreApp(_props: AppProps) {
  const installed = useAppManagerStore((s) => s.installed);
  const remote = useAppManagerStore((s) => s.remote);
  const entries = Object.values(EXTENSIONS).sort(
    (a, b) => (a.manifest.order ?? 100) - (b.manifest.order ?? 100),
  );
  const installedList = entries.filter((e) => installed.includes(e.manifest.id));
  const availableList = entries.filter((e) => !installed.includes(e.manifest.id));
  const remoteList = Object.entries(remote).map(([id, info]) => ({
    id,
    name: info.name,
    icon: info.icon,
    version: info.version,
    description: info.description ?? "",
    blurb: info.description ?? "远程应用",
    url: info.url,
    category: (info.category as CatalogApp["category"]) ?? "tools",
    order: info.order ?? 100,
  }));

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
          <div className="store-section-title">已安装（{installedList.length + remoteList.length}）</div>
          {installedList.map((def) => (
            <StoreRow key={def.manifest.id} def={def} installed onUninstall={() => runUninstall(def.manifest.id, def.manifest.name)} />
          ))}
          {remoteList.map((app) => (
            <StoreRow
              key={app.id}
              def={{ manifest: app, blurb: app.blurb }}
              installed
              onUninstall={() => runUninstall(app.id, app.name)}
            />
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

      <RemoteCatalog installedRemote={remote} />

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

function runUninstall(id: string, name: string) {
  const yes = window.confirm(`卸载「${name}」？\n图标会从桌面消失，数据保留，重新安装可恢复。`);
  if (!yes) return;
  uninstallApp(id);
  bus.emit("notify", { appId: "store", title: `已卸载「${name}」`, body: "数据保留，随时可以装回来" });
}

/** 远程目录：填一个目录 JSON 地址，加载后可安装第三方 App（ESM 入口，需对方开 CORS） */
function RemoteCatalog({ installedRemote }: { installedRemote: Record<string, unknown> }) {
  const catalogUrl = useAppManagerStore((s) => s.catalogUrl);
  const [url, setUrl] = useState(catalogUrl);
  const [apps, setApps] = useState<CatalogApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load(target: string, silent = false) {
    const trimmed = target.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setMessage("");
    useAppManagerStore.getState().setCatalogUrl(trimmed);
    try {
      const response = await fetch(trimmed, { cache: "no-store" });
      if (!response.ok) throw new Error(`目录服务返回 ${response.status}`);
      const parsed = parseAppCatalog(await response.text());
      setApps(parsed);
      if (parsed.length === 0) setMessage("目录是空的");
    } catch (error) {
      setApps(null);
      const text = error instanceof Error ? error.message : String(error);
      if (!silent) setMessage(text.slice(0, 80));
    } finally {
      setLoading(false);
    }
  }

  // 打开商店时如果保存过目录地址，自动刷新一次（离线静默）
  useEffect(() => {
    if (catalogUrl) void load(catalogUrl, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogUrl]);

  function installRemote(app: CatalogApp) {
    if (isReservedAppId(app.id)) {
      bus.emit("notify", { kind: "error", appId: "store", title: `「${app.id}」与已有应用冲突` });
      return;
    }
    const ok = installRemoteApp(app);
    bus.emit("notify", {
      appId: "store",
      title: ok ? `已安装「${app.name}」` : `安装失败：${app.name}`,
      body: ok ? "图标已放到桌面" : "远程应用注册失败",
    });
  }

  return (
    <div className="store-section">
      <div className="store-section-title">远程目录</div>
      <div className="catalog-row">
        <input
          value={url}
          placeholder="https://example.com/purin-catalog.json"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load(url);
          }}
        />
        <button type="button" className="secondary" disabled={loading || !url.trim()} onClick={() => void load(url)}>
          {loading ? "加载中…" : "加载"}
        </button>
      </div>
      {message && <div className="catalog-message">{message}</div>}
      {apps && apps.length > 0 && (
        <ul className="catalog-list">
          {apps.map((app) => {
            const taken = isReservedAppId(app.id);
            return (
              <li key={app.id} className="store-row">
                <div className="store-row-icon">{app.icon}</div>
                <div className="store-row-main">
                  <div className="store-row-name">
                    {app.name}
                    <span className="store-row-meta">v{app.version}</span>
                    <span className="store-row-meta">{CATEGORY_LABELS[app.category] ?? "工具"}</span>
                  </div>
                  <div className="store-row-blurb">{app.blurb}</div>
                </div>
                {installedRemote[app.id] ? (
                  <span className="store-row-meta">已安装</span>
                ) : taken ? (
                  <span className="store-row-meta">id 冲突</span>
                ) : (
                  <button type="button" className="store-btn" onClick={() => installRemote(app)}>
                    安装
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="store-foot">远程 App 是第三方网页模块，只装你信任的目录。</div>
    </div>
  );
}

function StoreRow({
  def,
  installed,
  onInstall,
  onUninstall,
}: {
  def: { manifest: { id: string; name: string; icon: string; version: string; category?: string }; blurb: string };
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
      )}
    </div>
  );
}
