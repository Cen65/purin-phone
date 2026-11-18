import { useNotificationsStore, selectUnreadCount } from "../state/notificationsStore";
import { usePhoneStore } from "../state/phoneStore";
import { relativeTime } from "../state/momentsStore";

/**
 * 通知中心（P2）：状态栏 🔔 下拉出来的"收件箱"。
 * 数据来自 notificationsStore（bus 的 notify 事件在 main.tsx 里灌入）。
 */
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore(selectUnreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const clear = useNotificationsStore((s) => s.clear);
  const openApp = usePhoneStore((s) => s.openApp);

  function open(appId?: string) {
    if (appId) openApp(appId);
    onClose();
  }

  return (
    <div className="notif-panel-mask" onClick={onClose}>
      <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
        <div className="notif-panel-head">
          <span>通知中心{unread > 0 && <span className="notif-unread">{unread} 条未读</span>}</span>
          <span className="notif-panel-actions">
            <button type="button" className="link-btn" onClick={markAllRead}>
              全部已读
            </button>
            <button type="button" className="link-btn" onClick={clear}>
              清空
            </button>
            <button type="button" className="link-btn" onClick={onClose}>
              关闭
            </button>
          </span>
        </div>
        {items.length === 0 ? (
          <div className="notif-empty">暂无通知</div>
        ) : (
          <ul className="notif-list">
            {[...items]
              .slice(-20)
              .reverse()
              .map((item) => (
                <li key={item.id} className={`notif-item ${item.read ? "" : "notif-item-unread"}`}>
                  <button type="button" className="notif-item-body" onClick={() => open(item.appId)}>
                    <span className={`notif-item-title ${item.kind === "error" ? "text-danger" : ""}`}>
                      {item.title}
                    </span>
                    {item.body && <span className="notif-item-text">{item.body}</span>}
                  </button>
                  <span className="notif-item-time">{relativeTime(item.at)}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
