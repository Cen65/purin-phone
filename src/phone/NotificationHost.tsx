import { useEffect, useState } from "react";
import { bus, type PhoneEvents } from "../core/events";
import { uid } from "../core/id";
import { usePhoneStore } from "../state/phoneStore";

interface Toast {
  id: string;
  appId?: string;
  title: string;
  body?: string;
  kind: "info" | "error";
}

const TOAST_MS = 3500;

/**
 * 系统通知层：监听事件总线的 notify 事件，以横幅形式展示。
 * 这是“事件解耦”的示范：任何 App/模块 emit 即可弹通知，无需依赖 UI。
 */
export function NotificationHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const openApp = usePhoneStore((s) => s.openApp);

  useEffect(() => {
    const off = bus.on("notify", (event: PhoneEvents["notify"]) => {
      const toast: Toast = {
        id: uid(),
        appId: event.appId,
        title: event.title,
        body: event.body,
        kind: event.kind ?? "info",
      };
      setToasts((current) => [...current.slice(-2), toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, TOAST_MS);
    });
    return off;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-layer">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          className={`toast ${toast.kind === "error" ? "toast-error" : ""}`}
          onClick={() => {
            if (toast.appId) openApp(toast.appId);
            setToasts((current) => current.filter((item) => item.id !== toast.id));
          }}
        >
          <span className="toast-title">{toast.title}</span>
          {toast.body && <span className="toast-body">{toast.body}</span>}
        </button>
      ))}
    </div>
  );
}
