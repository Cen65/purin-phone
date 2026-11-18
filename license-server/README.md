# license-server — 激活码授权服务器（M2）

一码一设备的激活码商用方案：**零运行时依赖**（Node ≥ 23 原生跑 TypeScript，HTTP 用 `node:http`，数据库用内置 `node:sqlite`），单文件 SQLite，十分钟部署。

前端开关见 `purin/public/commercial.json`：`mode: "open"` 单机版（不连本服务器）；`mode: "licensed"` 商用版（激活码 + 设备绑定）。

## 快速开始（本地）

```bash
cd purin/license-server
pnpm install --ignore-workspace   # 只装 devDeps（typescript/vitest）
cp config.example.json config.json   # 改 adminPassword！
pnpm start                          # http://127.0.0.1:3000/admin
```

环境变量可覆盖 config.json：`PORT` / `ADMIN_PASSWORD` / `DATA_DIR` / `DB_FILE`。

## 服务器部署（Docker，推荐）

```bash
# 1. 传代码到服务器
scp -r purin/license-server user@your-server:/opt/

# 2. 改两处配置
cd /opt/license-server
vi Caddyfile          # 换成你的域名（DNS 先指向服务器 IP）
vi docker-compose.yml # 改 ADMIN_PASSWORD

# 3. 启动（Caddy 自动申请 HTTPS 证书）
docker compose up -d
```

后台地址 `https://你的域名/admin`。数据库在 docker 卷 `license-data` 中。

无 Docker 时直接跑：`ADMIN_PASSWORD=xxx PORT=3000 node src/server.ts`（需 Node ≥ 23）。

## 线下收款流程

1. 后台「生成激活码」→ 得到 `XXXX-XXXX-XXXX-XXXX-XXXX`（可设套餐/天数/备注）
2. 买家线下付款（微信/支付宝转账）
3. 把码发给买家 → 买家在应用「设置 → 授权状态」输入 → 激活即绑定设备
4. 换设备：买家可在应用内自助解绑（默认 30 天一次），或卖家后台「解绑」（无限制）
5. 售后：后台可封禁（退款收回）、恢复、延期、看活跃统计

## 管理后台功能

| 功能 | 说明 |
| --- | --- |
| 生成激活码 | 批量 1-1000 个，指定套餐/有效天数/备注，一键复制 |
| 码列表 | 搜索（码/备注/设备指纹）、状态过滤、分页 |
| 解绑 | 清除设备绑定（无冷却），买家换设备用 |
| 封禁/恢复 | 封禁立即失效（token 即刻作废） |
| 延期 | 已激活码在到期时间上加天数 |
| 统计 | 未激活/已激活/封禁数量、绑定设备、今日活跃、7 天激活次数 |
| 备份 | 下载数据库快照（VACUUM INTO），另有 scripts/backup.sh 定时脚本 |

## 客户端 API（供 purin 或其他客户端调用）

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/activate` | POST | `{code, deviceFingerprint, deviceName?}` → `{token, plan, expiresAt}`；409=已绑他设备 |
| `/api/heartbeat` | POST | `{token, deviceFingerprint}` → 滚动续期，24h 一次即可 |
| `/api/deactivate` | POST | 自助解绑（30 天冷却），换设备用 |

`/api/*` 带 CORS 头，前端可跨域直连。激活限 20 次/小时/IP，管理登录 10 次/小时/IP。

## 数据与运维

- 数据都在 `data/license.db`（WAL 模式）。迁移服务器 = 停容器 → 拷 `data/` → 起容器。
- 每日备份：`crontab -e` 加 `0 4 * * * /opt/license-server/scripts/backup.sh /opt/license-server/data`
- 日志：`docker compose logs -f license`

## 安全说明

- 管理密码经 `timingSafeEqual` 比对；登录错误写审计日志。
- 设备指纹是浏览器本地生成的 UUID（存 localStorage），清浏览器数据等于新设备——这是 Web 方案的固有边界，重要售卖操作以后台为准。
- 激活码 ≈ 100 bit 随机（无 0/O/1/I/L 混淆字符），不可枚举。
