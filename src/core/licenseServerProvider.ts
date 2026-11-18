import type {
  ActivationOutcome,
  DeviceInfo,
  EntitlementProvider,
  EntitlementState,
} from "./entitlement";
import { getDeviceInfo } from "./entitlement";
import { safeLocalStorage } from "./storage";

const STORAGE_KEY = "purin.license";
/** 超过这么多天没联网验证，本地缓存不再信任（与服务端 tokenTtlDays 呼应）。 */
const OFFLINE_GRACE_MS = 7 * 24 * 3600 * 1000;
const HEARTBEAT_INTERVAL_MS = 24 * 3600 * 1000;

interface LicenseCache {
  token?: string;
  plan?: string;
  expiresAt?: number;
  lastCheckedAt?: number;
  revoked?: boolean;
}

function readCache(): LicenseCache {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY);
    return typeof raw === "string" && raw ? (JSON.parse(raw) as LicenseCache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: LicenseCache): void {
  safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

function clearCache(): void {
  safeLocalStorage.removeItem(STORAGE_KEY);
}

function post(base: string, path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${base.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function messageOf(reason: string, fallback: string, body?: Record<string, unknown>): string {
  // 服务器带回明确文案时优先透传（含冷却剩余时间等动态信息）
  if (body && typeof body.message === "string" && body.message.length > 0) return body.message;
  switch (reason) {
    case "already_bound": return "该激活码已绑定其他设备，请联系卖家解绑";
    case "revoked": return "该激活码已被停用，请联系卖家";
    case "expired": return "该激活码已到期，可输入新激活码续期";
    case "cooldown": return "解绑过于频繁，请稍后再试或联系卖家";
    case "rate_limited": return "请求过于频繁，请稍后再试";
    default: return fallback;
  }
}

/**
 * 基于 license-server 的授权 Provider。
 * 本地缓存 token；心跳 24h 一次；7 天离线宽限；网络异常不动状态。
 */
export function createLicenseServerProvider(baseUrl: string): EntitlementProvider {
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  function describe(): EntitlementState {
    const cache = readCache();
    if (cache.revoked) {
      return { status: "revoked", message: "授权已被停用，请联系卖家" };
    }
    if (!cache.token) {
      return { status: "unactivated", message: "输入激活码解锁完整功能" };
    }
    const now = Date.now();
    if (cache.expiresAt !== undefined && cache.expiresAt <= now) {
      return { status: "expired", plan: cache.plan, expiresAt: cache.expiresAt, message: "激活码已到期，可输入新码续期" };
    }
    if (cache.lastCheckedAt === undefined || now - cache.lastCheckedAt > OFFLINE_GRACE_MS) {
      return {
        status: "expired",
        plan: cache.plan,
        expiresAt: cache.expiresAt,
        message: "超过 7 天未联网验证，请联网后重新验证（同设备免费，直接点激活即可）",
      };
    }
    return {
      status: "active",
      plan: cache.plan,
      expiresAt: cache.expiresAt,
      lastCheckedAt: cache.lastCheckedAt,
    };
  }

  async function activate(code: string, device?: DeviceInfo): Promise<ActivationOutcome> {
    const deviceInfo = device ?? getDeviceInfo();
    let res: Response;
    try {
      res = await post(baseUrl, "/api/activate", {
        code,
        deviceFingerprint: deviceInfo.fingerprint,
        deviceName: deviceInfo.name,
      });
    } catch {
      return { status: "expired", message: "无法连接授权服务器，请检查网络后重试" };
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const reason = typeof body.reason === "string" ? body.reason : "";
      return { status: res.status === 400 ? "unactivated" : "expired", message: messageOf(reason, "激活失败，请核对激活码", body) };
    }
    writeCache({
      token: String(body.token ?? ""),
      plan: typeof body.plan === "string" ? body.plan : undefined,
      expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : undefined,
      lastCheckedAt: Date.now(),
    });
    scheduleHeartbeat();
    return {
      status: "active",
      token: String(body.token ?? ""),
      plan: typeof body.plan === "string" ? body.plan : undefined,
      expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : undefined,
    };
  }

  async function refresh(device?: DeviceInfo): Promise<EntitlementState> {
    const cache = readCache();
    if (!cache.token) return describe();
    const deviceInfo = device ?? getDeviceInfo();
    try {
      const res = await post(baseUrl, "/api/heartbeat", {
        token: cache.token,
        deviceFingerprint: deviceInfo.fingerprint,
      });
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        writeCache({
          token: cache.token,
          plan: typeof body.plan === "string" ? body.plan : cache.plan,
          expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : cache.expiresAt,
          lastCheckedAt: Date.now(),
        });
        scheduleHeartbeat();
        return describe();
      }
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const reason = typeof body.reason === "string" ? body.reason : "";
      if (reason === "revoked") {
        writeCache({ ...cache, revoked: true });
      } else if (reason === "expired") {
        writeCache({ ...cache, expiresAt: Date.now() - 1, lastCheckedAt: Date.now() });
      } else {
        // token_expired / device_mismatch / bad_token：同设备重激活幂等，清掉让用户重输码
        clearCache();
      }
      return describe();
    } catch {
      // 网络异常：不动本地状态，靠离线宽限兜底
      return describe();
    }
  }

  async function deactivate(): Promise<ActivationOutcome> {
    const cache = readCache();
    if (!cache.token) return { status: "unactivated", message: "本设备尚未激活" };
    try {
      const res = await post(baseUrl, "/api/deactivate", {
        token: cache.token,
        deviceFingerprint: getDeviceInfo().fingerprint,
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        clearCache();
        return { status: "unactivated", message: typeof body.message === "string" ? body.message : "已解绑" };
      }
      const reason = typeof body.reason === "string" ? body.reason : "";
      return { status: "expired", message: messageOf(reason, "解绑失败，请稍后再试", body) };
    } catch {
      return { status: "expired", message: "无法连接授权服务器" };
    }
  }

  function scheduleHeartbeat(): void {
    if (heartbeatTimer !== undefined) return;
    heartbeatTimer = setInterval(() => {
      void refresh();
    }, HEARTBEAT_INTERVAL_MS);
  }

  return {
    id: "license-server",
    label: "激活码",
    describe,
    activate,
    refresh,
    deactivate,
  };
}
