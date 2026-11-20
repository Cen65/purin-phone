import { useEffect, useState, type ReactNode } from "react";
import { getEntitlementProvider, getDeviceInfo } from "../core/entitlement";
import type { EntitlementState } from "../core/entitlement";
import { Icon } from "../core/icons";

/**
 * 商用模式激活门：licensed 模式下未激活时挡住整个手机，
 * 激活/开放模式直接渲染 children。open provider 永远放行。
 */
export function ActivationGate({ children }: { children: ReactNode }) {
  const provider = getEntitlementProvider();
  const [state, setState] = useState<EntitlementState>(() => provider.describe());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (provider.refresh) {
      void provider.refresh(getDeviceInfo()).then((next) => {
        if (!cancelled) setState(next);
      });
    }
    return () => {
      cancelled = true;
    };
    // provider 在引导期注册，组件挂载后不再变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (provider.id === "open" || state.status === "open" || state.status === "active") {
    return <>{children}</>;
  }

  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const outcome = await provider.activate(code.trim(), getDeviceInfo());
      if (outcome.status === "active") {
        setState(outcome);
      } else {
        setError(outcome.message ?? "激活失败");
        // 可能本地缓存被刷新（如 token 失效场景），同步一次状态
        setState(provider.describe());
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="activation-gate">
      <div className="activation-card">
        <div className="activation-icon">
          <Icon name="phone" size={34} />
        </div>
        <h2>Purin</h2>
        <div className="activation-status">
          {state.status === "unactivated" ? "请输入激活码" : state.message || "授权已失效"}
        </div>
        {state.status === "expired" && state.plan ? (
          <div className="activation-hint">原套餐：{state.plan}</div>
        ) : null}
        <input
          className="activation-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") void activate();
          }}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          autoFocus
          disabled={busy}
        />
        <button className="activation-button" onClick={() => void activate()} disabled={busy || code.trim().length === 0}>
          {busy ? "激活中…" : "激活"}
        </button>
        {error ? <div className="activation-error">{error}</div> : null}
        <div className="activation-hint">激活码会将本设备与该码绑定；更换设备请联系卖家解绑</div>
      </div>
    </div>
  );
}
