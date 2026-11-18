/**
 * 商用开关配置。
 *
 * public/commercial.json 在构建后仍是纯静态文件，部署后可直接修改，
 * 无需重新构建前端：
 * - mode: "open"     单机版，不连授权服务器，所有功能开放（默认）
 * - mode: "licensed" 商用版，启动时要求输入激活码，一码绑定一台设备
 *   - licenseServer: 授权服务器地址，如 "https://license.example.com"
 */
export interface CommercialConfig {
  mode: "open" | "licensed";
  licenseServer: string;
}

const DEFAULT_CONFIG: CommercialConfig = { mode: "open", licenseServer: "" };

/** 拉取 commercial.json；任何失败都回落到 open（绝不让配置问题挡住启动）。 */
export async function loadCommercialConfig(): Promise<CommercialConfig> {
  try {
    const res = await fetch("commercial.json", { cache: "no-store" });
    if (!res.ok) return DEFAULT_CONFIG;
    const raw = (await res.json()) as Partial<CommercialConfig>;
    if (raw.mode === "licensed") {
      if (typeof raw.licenseServer !== "string" || !/^https?:\/\//.test(raw.licenseServer)) {
        console.warn("[config] licensed 模式缺少合法的 licenseServer，回落为 open 模式");
        return DEFAULT_CONFIG;
      }
      return { mode: "licensed", licenseServer: raw.licenseServer };
    }
    return DEFAULT_CONFIG;
  } catch {
    // 文件不存在 / 网络错误（file:// 打开等）→ 单机模式
    return DEFAULT_CONFIG;
  }
}
