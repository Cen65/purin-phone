/**
 * 授权（entitlement）抽象层 —— 商用化接缝。
 *
 * 默认是「开放模式」（openEntitlementProvider）：不做任何限制，行为与无此层时完全一致。
 * 商用时写一个对接激活码服务器的 Provider 注册进来（参考 docs/COMMERCIAL-DESIGN.md），
 * 再在启动流程里加一道激活页，即可实现「一码绑定一设备」的售卖模式。
 *
 * 安全边界必须说清楚：纯前端的授权校验是君子协定，真正的强制力在服务端
 * （AI 代理、云同步等只有持有效令牌才可用的能力）。详见 docs/COMMERCIAL-DESIGN.md。
 */
import { uid } from "./id";
import { safeLocalStorage } from "./storage";

export type EntitlementStatus = "open" | "unactivated" | "active" | "expired" | "revoked";

/** 授权状态快照。 */
export interface EntitlementState {
  status: EntitlementStatus;
  /** 套餐标识，例如 "standard" / "pro"。 */
  plan?: string;
  /** 到期时间（epoch 毫秒）。 */
  expiresAt?: number;
  /** 上次服务端校验时间（epoch 毫秒），用于离线宽限期判断。 */
  lastCheckedAt?: number;
  /** 给用户看的补充说明。 */
  message?: string;
}

/** activate() 的返回：授权状态 + 服务端签发的令牌。 */
export interface ActivationOutcome extends EntitlementState {
  /** 访问令牌：客户端保存，后续心跳与受保护请求都携带。 */
  token?: string;
}

/** 设备标识。指纹是持久化 UUID（清浏览器数据会变，换绑流程要考虑这一点）。 */
export interface DeviceInfo {
  fingerprint: string;
  /** 可读设备名，例如浏览器 UserAgent 摘要。 */
  name?: string;
}

export interface EntitlementProvider {
  id: string;
  label: string;
  /** 同步返回当前授权快照（启动页/设置页展示用）。 */
  describe(): EntitlementState;
  /** 用激活码激活并绑定当前设备。 */
  activate(code: string, device: DeviceInfo): Promise<ActivationOutcome>;
  /** 心跳/续验：在线时定期调用，刷新本地有效期与状态。 */
  refresh?(device: DeviceInfo): Promise<EntitlementState>;
  /** 解绑 / 登出：返回结果供设置页展示（如冷却期提示）。 */
  deactivate?(): Promise<ActivationOutcome>;
}

export const ENTITLEMENT_STATUS_LABELS: Record<EntitlementStatus, string> = {
  open: "开放使用",
  unactivated: "未激活",
  active: "已激活",
  expired: "已过期",
  revoked: "已封禁",
};

const providers = new Map<string, EntitlementProvider>();
let activeId = "open";

/**
 * 注册一个授权 Provider。activateImmediately 为 true 时切换为当前生效模式
 *（接入激活码服务器时通常在应用入口处注册并立即生效）。
 */
export function registerEntitlementProvider(
  provider: EntitlementProvider,
  options?: { activateImmediately?: boolean },
): void {
  if (providers.has(provider.id)) {
    throw new Error(`[entitlement] 授权 Provider id 重复：${provider.id}`);
  }
  providers.set(provider.id, provider);
  if (options?.activateImmediately) activeId = provider.id;
}

export function setActiveEntitlementProvider(id: string): void {
  if (!providers.has(id)) {
    throw new Error(`[entitlement] 未注册的授权 Provider：${id}`);
  }
  activeId = id;
}

export function getEntitlementProvider(): EntitlementProvider {
  return providers.get(activeId) ?? openEntitlementProvider;
}

export function listEntitlementProviders(): EntitlementProvider[] {
  return [...providers.values()];
}

/** 默认的开放模式：无任何限制。激活码机制接入前，它就是唯一生效的 Provider。 */
export const openEntitlementProvider: EntitlementProvider = {
  id: "open",
  label: "开放使用",
  describe: () => ({ status: "open", message: "未启用商用授权" }),
  async activate() {
    throw new Error("开放模式无需激活");
  },
};

registerEntitlementProvider(openEntitlementProvider);

const DEVICE_KEY = "purin.device";

/**
 * 获取本设备标识：首次调用生成持久化 UUID，之后稳定不变。
 * 注意：用户清除浏览器存储后指纹会重新生成（等于一台"新设备"），
 * 商用时的换绑/找回流程必须覆盖这种情况。
 */
export function getDeviceInfo(): DeviceInfo {
  const stored = safeLocalStorage.getItem(DEVICE_KEY);
  let fingerprint = typeof stored === "string" ? stored : "";
  if (!fingerprint) {
    fingerprint = uid();
    safeLocalStorage.setItem(DEVICE_KEY, fingerprint);
  }
  const name =
    typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : undefined;
  return { fingerprint, name };
}
