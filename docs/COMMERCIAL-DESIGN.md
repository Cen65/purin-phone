# 商用化设计：激活码 + 设备绑定 + 管理后台

> 目标：售卖激活码，一码绑定一台设备；配套管理后台做码的生成、查询、解绑、封禁。
> 客户端接缝已埋好：`src/core/entitlement.ts`（默认开放模式，零影响日常使用）。

## 0. 先想清楚：激活码保护的是什么

**纯前端的授权墙防不住任何人**——懂代码的用户改一个 `if` 就绕过了。激活码只有在
**服务端掌握不可替代的价值**时才有实际约束力。所以先选商业模式：

| 模式 | 做法 | 防破解强度 | 适合 |
| --- | --- | --- | --- |
| A. 卖软件 | 激活码=使用权，AI Key 用户自己填（现状） | 弱（君子协定） | 低价、信任型社区 |
| B. 卖服务 | AI 请求全部经**你的服务器代理**，用户不接触 Key；激活码=账号/额度 | 强（价值在服务端） | 正式商用，推荐 |
| C. 混合 | 软件免费 + 云同步/独家角色/语音等增值订阅 | 中~强 | 长线运营 |

**建议 B（或 B+C）**。核心思路：把 purin 里的 `openai-compatible` Provider 换成
`你的服务-proxy` Provider——它把聊天请求转发到你的 License 服务器，服务器验证令牌后
再调用真正的 AI 服务。用户买到的不只是一个码，而是"开箱即用、无需自己搞 API"的体验，
破解客户端也拿不到 AI 服务本身。

## 1. 系统组成

```
┌──────────────┐  激活/心跳   ┌──────────────────┐   签发/管理   ┌──────────────┐
│  purin       │ ──────────→ │  License Server   │ ←─────────── │  管理后台     │
│  (浏览器)    │  AI 代理     │  + AI 网关(可选)  │   发卡 webhook│  (你用)      │
└──────────────┘ ──────────→ └──────────────────┘ ←─────────── └──────────────┘
                                   ↑  发货（买码→发码）
                              ┌──────────────┐
                              │ 发卡平台      │（独角数卡/虎皮椒/面包多等）
                              └──────────────┘
```

## 2. 激活码与设备绑定规则

- **码格式**：`XXXX-XXXX-XXXX-XXXX`（20 位含 4 位校验位，随机空间 ≥ 96 bits，防猜）。
  服务端生成时绑定批次、套餐、有效期。
- **一码一设备**：激活时上传设备指纹（`getDeviceInfo()` 已提供持久化 UUID），
  服务器记录 `code ↔ device` 绑定；已绑定的码在新设备激活直接拒绝。
- **换绑**：用户清了浏览器数据/换了电脑 ⇒ 指纹变了。两种策略（建议前者）：
  1. 自助换绑：允许用户每 30 天自助解绑一次（防止一码多人共享）；
  2. 人工解绑：管理后台一键解绑，备注原因。
- **心跳**：客户端每 24h 调 `refresh()` 续验；连续 N 天（可配，建议 7）未心跳则本地进入
  `expired`，提示联网恢复。
- **退款/风控**：管理后台可 `revoked`（封禁，立即失效）、改有效期、按订单号反查。

## 3. 数据模型（License Server，SQLite 即可起步）

```sql
CREATE TABLE codes (
  id            INTEGER PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,        -- XXXX-XXXX-XXXX-XXXX
  batch_id      TEXT NOT NULL,               -- 生成批次，便于按批发货
  plan          TEXT NOT NULL DEFAULT 'standard',
  status        TEXT NOT NULL DEFAULT 'unsold',  -- unsold|active|revoked
  expires_at    INTEGER,                     -- 激活后起算的有效期（epoch ms）
  duration_days INTEGER NOT NULL DEFAULT 365,-- 激活时换算成 expires_at
  order_no      TEXT,                        -- 发卡平台订单号（对账用）
  note          TEXT,
  created_at    INTEGER NOT NULL,
  activated_at  INTEGER
);

CREATE TABLE devices (
  id           INTEGER PRIMARY KEY,
  code_id      INTEGER NOT NULL REFERENCES codes(id),
  fingerprint  TEXT NOT NULL,                -- 客户端持久化 UUID
  device_name  TEXT,                         -- UA 摘要，方便客服排查
  bound_at     INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(code_id, fingerprint)               -- 一码一设备（放宽改这里）
);

CREATE TABLE tokens (
  token        TEXT PRIMARY KEY,             -- 服务端随机签发
  code_id      INTEGER NOT NULL REFERENCES codes(id),
  device_fp    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,             -- 短期（如 7 天），心跳滚动续期
  created_at   INTEGER NOT NULL
);

CREATE TABLE activation_logs (               -- 审计：防暴力猜码/共享排查
  id INTEGER PRIMARY KEY, code TEXT, device_fp TEXT,
  ip TEXT, ok INTEGER, message TEXT, at INTEGER NOT NULL
);
```

## 4. API 设计

客户端（全部 HTTPS + 频控，**已按此实现并测过**）：

```
POST /api/activate     { code, deviceFingerprint, deviceName }
  → 200 { status:"active", token, plan, expiresAt }   -- 同设备重复激活幂等（重签 token）
  → 400 { reason:"bad_code" } | 403 { reason:"revoked"|"expired" }
  → 409 { reason:"already_bound" }                     -- 已绑其他设备
POST /api/heartbeat    { token, deviceFingerprint }
  → 200 { valid:true, plan, expiresAt }               -- 滚动续期 + 更新 last_seen_at
  → 401 { valid:false, reason:"token_expired"|"device_mismatch"|"revoked"|"expired" }
POST /api/deactivate   { token, deviceFingerprint }    -- 自助换绑（30 天一次）
  → 200 | 429 { reason:"cooldown", retryAt }
POST /api/chat         Authorization: Bearer <token>   -- 模式 B：AI 代理网关（未实现）
  → SSE 流（透传 OpenAI 兼容格式）
```

`/api/*` 已带 CORS 头，前端可跨域直连。频控：激活 20 次/小时/IP，心跳 60 次/小时/IP。

管理后台（登录态 + 操作审计，**已实现**，前缀 `/admin/api`）：

```
POST /admin/api/login                      { password } → { token }（12h 会话；错误密码限 10 次/h）
GET  /admin/api/stats                      统计卡片数据
POST /admin/api/codes                      生成批次 { count, plan, durationDays, note } → { batchId, codes[] }
GET  /admin/api/codes?q=&status=&limit=&offset=  列表/搜索（码、备注、设备指纹、状态过滤、分页）
POST /admin/api/codes/:code/unbind         解绑设备（无冷却）
POST /admin/api/codes/:code/revoke|restore 封禁（token 即刻作废）/ 恢复
POST /admin/api/codes/:code/extend         { days } 延期（base = max(now, 当前到期时间)）
GET  /admin/api/backup                     下载数据库快照（VACUUM INTO）
POST /admin/webhook/card                   发卡平台回调（未做：走线下收款）
```

## 5. 管理后台功能清单（MVP）

1. 登录（单管理员账号即可起步，TOTP 二次验证可选）
2. 批量生成激活码 → 表格 + CSV 导出（对接发卡平台批量导入）
3. 查询：按码/订单号/设备指纹搜索，看绑定与心跳详情
4. 操作：解绑、封禁、延期、备注（每个操作写审计日志）
5. 简表盘：售出/激活/活跃设备/到期分布

技术选型建议：Node（Hono/Express）+ SQLite 单文件起步，后台页面直接 React+Vite
（可复用 purin 的工程习惯），一台小 VPS 足够。

**实际落地（M2/M3）**：见 `purin/license-server/`。Node ≥ 23 原生跑 TypeScript，
**零运行时依赖**（`node:http` + 内置 `node:sqlite`）；后台是 `/admin` 同域单文件页面
（无构建步骤）。§5 清单已全部实现（CSV 导出/订单号/webhook 未做——按当前决策走线下收款，用不到）。

## 5.5 一键开关：open（单机）↔ licensed（商用）

`purin/public/commercial.json` 是唯一的开关，**构建后直接改文件即可切换，无需重新构建**：

```jsonc
// 单机版（默认）：不连授权服务器，无激活页，全功能开放
{ "mode": "open", "licenseServer": "" }

// 商用版：启动出现激活页（ActivationGate），一码一设备
{ "mode": "licensed", "licenseServer": "https://license.example.com" }
```

实现链路：`src/core/config.ts` 启动时 fetch 该文件（失败/非法一律回落 open，
**配置错误永远不挡应用启动**）→ licensed 时在 `main.tsx` 注册
`createLicenseServerProvider(url)` 并设为当前 Provider → `App.tsx` 的
`ActivationGate` 在未激活时挡住整个手机。设置 → 关于 → 授权状态可查看套餐/有效期，
并提供了「解绑本设备」入口（默认 30 天冷却一次）。

## 6. 客户端接入（purin 侧改动，按此顺序）

1. **Provider**（✅ 已实现 `src/core/licenseServerProvider.ts`）：
   `activate()` 调 `/api/activate` 并把 token 存 `safeLocalStorage`（KEY `purin.license`）；
   `refresh()` 调 `/api/heartbeat`（24h 一次 + 启动时一次）；`describe()` 读本地缓存 +
   7 天离线宽限判断；网络异常不动本地状态。启动注册在 `main.tsx` 的 `bootstrap()`。
2. **激活页**（✅ 已实现 `src/phone/ActivationGate.tsx`）：非 active/open 状态时
   前置激活屏（输码 → `activate(code, getDeviceInfo())`），成功进入桌面。
3. **AI 网关**（模式 B，未做）：注册一个 `gateway` LLMProvider，chat() 把请求发到
   `/api/chat` 带 Bearer token——用户侧"零配置开箱即用"。
4. **设置页**（✅）：「关于」区展示授权状态/套餐/有效期 + 「解绑本设备」按钮（冷却提示透传）。

## 6.5 线下收款流程（当前采用的完整闭环）

1. 卖家部署 license-server（`docker compose up -d`，见 `license-server/README.md`）
2. 后台 `/admin` 生成激活码（设套餐/有效天数/备注，如「闲鱼 11 月批次」）→ 一键复制
3. 买家线下付款（微信/支付宝转账）
4. 卖家把码发给买家 → 买家打开应用 → 激活页输码 → **激活即绑定该设备**
5. 售后场景：
   - 买家换设备 → 应用内「解绑本设备」（30 天一次）或卖家后台解绑（无限制）
   - 退款收回 → 后台「封禁」（token 即刻作废，下次心跳/启动即失效）
   - 续费 → 后台「延期」（在当前到期时间上加天数）
   - 追查 → 按码/备注/设备指纹搜索，看激活与最近活跃时间

## 7. 安全边界与防滥用（务必照做）

- 前端校验只是体验（快速反馈），**一切真正的校验在服务端**：AI 代理、云功能拒绝无效 token。
- 激活接口：按 IP 频控（如 10 次/小时），失败锁定；`activation_logs` 全量留痕。
- token 短期 + 心跳滚动续期，泄露影响小；不做 refresh token 轮换复杂度（规模不需要）。
- 码不放进前端代码/仓库；管理后台与主服务同机部署时用内网端口 + 防火墙。
- Web 端没有完美的"设备"概念（清存储/无痕模式=新指纹），**接受它**，用换绑策略兜底，
  不要过度收集硬件信息（指纹只用于绑定计数，不做人脸/硬件级指纹）。
- 售卖前备齐：用户协议（注明虚拟商品、退款政策）、隐私声明（收集了什么：设备指纹/IP）。

## 8. 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 | `src/core/entitlement.ts` 接缝 + 设置页授权状态展示 + 单测 | ✅ 已完成 |
| M2 | License Server 最小版（生成/激活/心跳/解绑，SQLite） | ✅ 已完成（`license-server/`，17 个端到端测试） |
| M3 | 管理后台 MVP（§5 清单）+ 发卡平台对接 webhook | ✅ 已完成（webhook 按线下收款决策搁置） |
| M4 | 客户端激活页 + commercial.json 开关 + 自助解绑 | ✅ 已完成（gateway Provider 属模式 B 后续项） |
| M5 | 防滥用完善（频控/审计已就位）+ 到期续费流程 | 部分（频控 + 审计日志已实现；续费靠后台延期） |

部署与运维细节（Docker/Caddy/备份脚本/服务器选购建议）见
[license-server/README.md](../license-server/README.md)。

## 9. 法务与授权注意

- `purin/` 代码全部原创，可自由商用、自选许可证（建议 MIT 或专有闭源）。
- 模式 B 下你的服务器转售 AI 能力，注意：上游服务商（OpenAI/DeepSeek 等）条款是否
  允许转售、内容安全责任在你，用户协议里要写清楚。
