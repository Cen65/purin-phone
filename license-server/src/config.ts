import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 服务器配置：config.json + 环境变量覆盖（环境变量优先）。 */
export interface ServerConfig {
  /** HTTP 监听端口。 */
  httpPort: number;
  /** 管理后台密码（务必修改，或用环境变量 ADMIN_PASSWORD）。 */
  adminPassword: string;
  /** 数据目录（SQLite 文件所在）。 */
  dataDir: string;
  /** SQLite 文件名；测试传 ":memory:"。 */
  dbFile: string;
  /** 用户自助解绑冷却天数（防一码多人共享）。 */
  selfUnbindCooldownDays: number;
  /** 访问令牌有效期（天），心跳滚动续期。 */
  tokenTtlDays: number;
}

type ConfigFile = Partial<ServerConfig>;

const DEFAULTS: ServerConfig = {
  httpPort: 3000,
  adminPassword: "change-me-please",
  dataDir: "data",
  dbFile: "license.db",
  selfUnbindCooldownDays: 30,
  tokenTtlDays: 7,
};

function readConfigFile(path: string): ConfigFile {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch (error) {
    throw new Error(`config.json 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 加载配置：config.json（可选）→ 环境变量覆盖 → 传入 overrides 最后生效（测试用）。 */
export function loadConfig(overrides?: Partial<ServerConfig>): ServerConfig {
  const file = readConfigFile(resolve(process.cwd(), "config.json"));
  const env = {
    httpPort: process.env.PORT ? Number(process.env.PORT) : undefined,
    adminPassword: process.env.ADMIN_PASSWORD ?? undefined,
    dataDir: process.env.DATA_DIR ?? undefined,
    dbFile: process.env.DB_FILE ?? undefined,
  };
  const merged: ServerConfig = {
    ...DEFAULTS,
    ...clean(file),
    ...clean(env),
    ...clean(overrides ?? {}),
  };
  return merged;
}

function clean(source: object): Partial<ServerConfig> {
  const out: Partial<ServerConfig> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
