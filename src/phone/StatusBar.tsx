import { useEffect, useState } from "react";
import { Icon } from "../core/icons";
import { useNotificationsStore, selectUnreadCount } from "../state/notificationsStore";
import { usePhoneStore } from "../state/phoneStore";
import { NotificationPanel } from "./NotificationPanel";

/** 顶部状态栏：时间 + 信号/电量（装饰性）+ 通知铃铛 + 锁屏（P2） */
export function StatusBar() {
  const [now, setNow] = useState(() => new Date());
  const [panelOpen, setPanelOpen] = useState(false);
  const unread = useNotificationsStore(selectUnreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const lock = usePhoneStore((s) => s.lock);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <>
      <div className="status-bar">
        <span className="status-time">{time}</span>
        <span className="status-right">
          <button
            type="button"
            className={`notif-bell ${unread > 0 ? "notif-bell-active" : ""}`}
            title="通知中心"
            aria-label="通知中心"
            onClick={() => {
              setPanelOpen(true);
              markAllRead();
            }}
          >
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="notif-bell-dot">{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button type="button" className="lock-btn" title="锁屏" aria-label="锁屏" onClick={lock}>
            <Icon name="lock" size={16} />
          </button>
          <span aria-hidden="true">
            <span className="signal-bars">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="battery">
              <i className="battery-fill" />
            </span>
          </span>
        </span>
      </div>
      {panelOpen && <NotificationPanel onClose={() => setPanelOpen(false)} />}
    </>
  );
}
