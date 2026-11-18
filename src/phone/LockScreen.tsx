import { useEffect, useState } from "react";
import { useNotificationsStore } from "../state/notificationsStore";
import { usePhoneStore } from "../state/phoneStore";
import { relativeTime } from "../state/momentsStore";

/**
 * 锁屏（P2）：盖住整个手机界面，展示大时钟 + 最近未读通知。
 * 点击任意处解锁——刻意不做密码（玩具手机，不做真安全边界）。
 */
export function LockScreen() {
  const unlock = usePhoneStore((s) => s.unlock);
  const items = useNotificationsStore((s) => s.items);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  const recent = [...items].reverse().filter((item) => !item.read).slice(0, 3);

  return (
    <div className="lockscreen" onClick={unlock}>
      <div className="lockscreen-clock">
        <span className="lockscreen-time">{time}</span>
        <span className="lockscreen-date">{date}</span>
      </div>
      {recent.length > 0 && (
        <ul className="lockscreen-notifs">
          {recent.map((item) => (
            <li key={item.id}>
              <span className="lockscreen-notif-title">{item.title}</span>
              {item.body && <span className="lockscreen-notif-body">{item.body}</span>}
              <span className="lockscreen-notif-time">{relativeTime(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="lockscreen-hint">点击解锁</span>
    </div>
  );
}
