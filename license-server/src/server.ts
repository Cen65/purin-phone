import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { createApp } from "./http.ts";
import { RateLimiter } from "./util.ts";
import { join } from "node:path";

const config = loadConfig();
const db = openDb(join(config.dataDir, config.dbFile));
const server = createApp({
  config,
  db,
  rate: new RateLimiter(),
  adminSessions: new Map(),
  log: (msg) => console.log(`${new Date().toISOString()} ${msg}`),
});

setInterval(() => server.constructor.name === "" ? null : undefined, 3_600_000).unref?.();

server.listen(config.httpPort, () => {
  console.log(`[license-server] 已启动: http://127.0.0.1:${config.httpPort}`);
  console.log(`[license-server] 管理后台: http://127.0.0.1:${config.httpPort}/admin`);
  console.log(`[license-server] 数据目录: ${config.dataDir}/  (修改配置请编辑 config.json 或使用环境变量)`);
});
