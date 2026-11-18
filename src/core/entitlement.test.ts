import { describe, expect, it } from "vitest";
import {
  ENTITLEMENT_STATUS_LABELS,
  getDeviceInfo,
  getEntitlementProvider,
  listEntitlementProviders,
  openEntitlementProvider,
  registerEntitlementProvider,
  setActiveEntitlementProvider,
  type EntitlementProvider,
} from "./entitlement";

function makeProvider(id: string): EntitlementProvider {
  return {
    id,
    label: `测试-${id}`,
    describe: () => ({ status: "unactivated" }),
    async activate(code) {
      return { status: "active", plan: "test", token: `t-${code}` };
    },
  };
}

describe("entitlement 注册表", () => {
  it("默认生效的是开放模式 Provider", () => {
    const provider = getEntitlementProvider();
    expect(provider.id).toBe("open");
    expect(provider.describe().status).toBe("open");
    expect(ENTITLEMENT_STATUS_LABELS.open).toBe("开放使用");
  });

  it("注册后可切换生效，activate() 走新 Provider", async () => {
    registerEntitlementProvider(makeProvider("test-license"));
    setActiveEntitlementProvider("test-license");
    const provider = getEntitlementProvider();
    expect(provider.id).toBe("test-license");
    expect(provider.describe().status).toBe("unactivated");

    const outcome = await provider.activate("ABCD-1234", { fingerprint: "fp-1" });
    expect(outcome.status).toBe("active");
    expect(outcome.token).toBe("t-ABCD-1234");

    setActiveEntitlementProvider("open");
    expect(getEntitlementProvider().id).toBe("open");
  });

  it("重复注册相同 id 抛错；未注册 id 不能设为生效", () => {
    expect(() => registerEntitlementProvider(openEntitlementProvider)).toThrow(/重复/);
    expect(() => setActiveEntitlementProvider("nope")).toThrow(/未注册/);
  });

  it("listEntitlementProviders 包含内置与注册的 Provider", () => {
    const ids = listEntitlementProviders().map((provider) => provider.id);
    expect(ids).toContain("open");
    expect(ids).toContain("test-license");
  });
});

describe("getDeviceInfo", () => {
  it("指纹跨调用稳定（持久化）", () => {
    const first = getDeviceInfo();
    const second = getDeviceInfo();
    expect(first.fingerprint).toBeTruthy();
    expect(second.fingerprint).toBe(first.fingerprint);
  });
});
