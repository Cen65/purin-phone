# Purin

一个跑在浏览器里的"手机"：桌面、App、通知、主题一应俱全，里面的角色由任意
OpenAI 兼容 API（OpenAI / DeepSeek / 硅基流动 / Ollama / LM Studio …）驱动。
纯前端项目，无后端、无数据库，数据全部留在本地浏览器。

## 快速开始

```bash
cd purin
pnpm install --ignore-workspace   # 位于 pnpm workspace 子目录时必须带此参数
pnpm dev                          # http://127.0.0.1:5188
```

打开设置 App → 填入任意 OpenAI 兼容服务的 BaseURL / API Key / 模型名 →
回到聊天，和应用内助手"布丁兔"开始对话——除了陪聊，TA 还能教你用这部手机的全部功能。

```bash
pnpm build    # 类型检查 + 产物构建（dist/）
pnpm test     # 单元测试（vitest，进程内 threads 池）
pnpm preview  # 预览构建产物
```

## 已具备的能力

| 能力 | 说明 |
| --- | --- |
| 手机系统 | 状态栏（时钟/通知/锁屏）/ 桌面网格 / Dock / 底部导航 / 通知 Toast / 应用错误隔离 |
| App 注册表 | `registerApp()` 动态注册；基础 App：聊天 💬、联系人 👥、商店 🛍️、设置 ⚙️ |
| 应用商店 | 扩展按需安装/卸载（懒加载分包，不装不下载代码）：朋友圈 🌟、便签 📝、世界书 📖、天气 🌤（open-meteo）、纪念日 💞；卸载保留数据，重装即恢复 |
| AI 对话 | OpenAI 兼容 /chat/completions，SSE 流式输出，失败气泡内一键重新生成，**生成中可停止** |
| Markdown | AI 回复渲染粗体/斜体/行内码/代码块/链接/引用（零依赖、转义优先防注入） |
| 去 AI 味 | 统一说话纪律：短句口语、禁 markdown/说教/AI 腔、不承认自己是 AI；角色卡可调 篇幅/emoji/（小动作） |
| 群聊 | 多角色会话：按抢答策略回复（全员按序/随机/话痨加权）、单人失败不拦后续、气泡带发言人头像 |
| 角色卡 | JSON 导入导出（`purin.character` v1.2，含开场白/对话示例/说话风格，兼容旧 `my-phone.character`）；.txt/.md 标签式导入；✨ AI 捏人向导 |
| 世界书 | 背景知识库：条目 常驻/关键词/正则 触发 + 优先级 + 插入位置，挂角色或群（成员取并集），JSON/txt 导入导出 + 触发测试器 |
| 记忆 | 每角色长期记忆注入提示词；🧠 一键总结（弹窗确认）+ **自动巩固**：新消息攒够 12 条且离上次 ≥5 分钟 → 后台静默并入，设置可关 |
| 群聊抢答 | 建群/群聊头部可切 全员按序 · 随机抢答（每轮 1~2 人）· 话痨优先（按角色"说话风格"加权，话痨更容易抢话） |
| 主动消息 | 角色自己找话题给你发消息（间隔+随机抖动节奏）；角色级开关与作息（睡眠时段不打扰）、全局开关与频率可调；应用打开期间运行 |
| 朋友圈 | 手动发帖 + AI 角色随机生成动态，点赞 / 评论 / #话题 |
| 模拟来电 | 联系人拨号 → 全屏通话（接听/拒接/快捷语/计时），挂断自动转写进聊天 |
| 通知中心 | 🔔 下拉收件箱（最近 20 条）、未读角标、点击跳转；锁屏大时钟 |
| 深链路由 | `#/app/{id}?{params}` hash 同步，刷新还原、浏览器前进/后退 |
| 多服务商 | Provider 抽象 + 注册表；常用预设一键填入（DeepSeek/OpenAI/Kimi/硅基流动/OpenRouter/Ollama） |
| 主题 | CSS 变量主题系统，内置清白/夜色/抹茶/布丁/夜葡萄五套，`purin.theme` JSON 主题包导入导出 |
| 生图 | 聊天里 `/画 xxx` 生成图片（设置里填生图模型，如 Kwai-Kolors）；图片存 IndexedDB，不占 localStorage |
| 语音 | 自动朗读 AI 回复（🔊 开关）+ 🎤 语音输入（Web Speech API，Chrome/Edge） |
| 备份 | 设置页一键导出/导入全量 JSON（角色/聊天/世界书/授权绑定），换设备可搬家 |
| PWA | manifest + Service Worker：可安装到桌面/手机主屏，断网也能打开（图标为占位 SVG，待替换） |
| 持久化 | zustand persist + localStorage 适配层（未来无痛换 IndexedDB） |
| 事件总线 | 类型化事件解耦：聊天完成 → 通知 → 角标，App 之间零直接依赖 |
| 商用接缝 | entitlement 授权抽象层：默认开放模式，可整体替换为激活码/账号服务器（[docs/COMMERCIAL-DESIGN.md](docs/COMMERCIAL-DESIGN.md)） |
| 测试 | 166 个单测覆盖注册表与应用商店 / SSE 解析 / 提示词组装(含世界书与说话纪律) / 聊天状态机 / 群聊与生图执行器 / 主动消息(作息/到期/执行) / 记忆合并与自动巩固 / 群聊抢答抽样 / 角色卡解析 / 世界书解析 / 主题包 / 授权接缝 / 备份恢复 / 朋友圈 / 通话 / 天气与纪念日 |

## 架构一览

```
┌─────────────────────────────── PhoneShell ───────────────────────────────┐
│ StatusBar 🔔🔒  NotificationHost  HomeScreen/AppHost  NavBar  CallHost  │
│ LockScreen（locked 时盖全屏）      NotificationPanel（🔔 下拉）          │
├──────────────────────────── apps（可插拔） ───────────────────────────────┤
│ chat 💬  contacts 👥  moments 🌟  notes 📝  settings ⚙️  ← registerApp() │
├──────────────────────────── state（全局状态） ───────────────────────────┤
│ phoneStore  settingsStore  charactersStore  chatStore（persist 持久化）  │
│ groupsStore  momentsStore（persist）  notifications  call（会话级）      │
├──────────────────────────── ai（服务商抽象） ────────────────────────────┤
│ providers 注册表 → openaiCompatible（SSE） · presets · prompt(1v1/群/圈/ │
│ 通话) · chatRunner(停止/群聊轮次) · creative(朋友圈/通话回复)            │
├──────────────────────────── core / theme（地基） ────────────────────────┤
│ events 总线 · id · storage 适配层 · md 渲染 · deeplink · themes          │
└──────────────────────────────────────────────────────────────────────────┘
```

分层规则：`core/theme` 不依赖任何上层；`ai` 与 `state` 只依赖 `core`；
`apps` 只依赖 `ai`/`state` 的公开 API 与事件总线，**App 之间禁止互相 import**。

## 目录结构

```
purin/
├─ docs/
│  ├─ PLAN.md               # 分阶段发展计划（P0 底座 → P5 商用化；P1–P4 已完成）
│  ├─ EXTENDING.md          # 扩展指南：新增 App / Provider / 主题 / 事件 / 授权
│  └─ COMMERCIAL-DESIGN.md  # 商用设计：激活码 + 设备绑定 + 管理后台
├─ public/
│  ├─ commercial.json       # 商用开关：open=单机版 / licensed=激活码模式
│  ├─ manifest.webmanifest  # PWA 清单（安装到主屏）
│  ├─ sw.js                 # Service Worker（静态缓存壳；commercial.json 与授权接口永远走网络）
│  └─ icon*.svg             # 应用图标（占位布丁，欢迎替换成正式图标）
├─ src/
│  ├─ ai/            # Provider 抽象、openai-compatible(含生图)、预设、提示词(1v1/群/圈/通话)、运行器、创意生成、AI 捏人、记忆总结、主动消息引擎
│  ├─ apps/          # App 注册表 + 基础 App（chat/contacts/store/settings）+ 扩展目录 extensions.ts（moments/notes/worldbook/weather/anniversary 懒加载）
│  ├─ core/          # 事件总线、id、存储适配、md 渲染、deeplink、下载、世界书解析、授权接缝、商用配置、备份恢复、语音(TTS/ASR)、图片仓(IndexedDB)
│  ├─ phone/         # 手机壳（状态栏/锁屏/通知面板/通话层/激活门，不含业务）
│  ├─ state/         # zustand store（settings/characters/chat/groups/worldbooks/moments/phone/notifications/call/apps安装列表/proactive主动消息）
│  ├─ styles/        # global.css（全部样式，CSS 变量驱动）
│  └─ theme/         # 主题定义与注册
└─ license-server/   # 可选的激活码授权服务器（商用时才部署，见其 README）
```

## 商用开关

`public/commercial.json`（构建后可直接改文件，无需重新构建）：

```jsonc
{ "mode": "open", "licenseServer": "" }        // 单机版：不连任何服务器，全功能开放（默认）
{ "mode": "licensed", "licenseServer": "https://你的域名" }  // 商用版：启动要求激活码，一码绑一设备
```

商用模式需要先部署 `license-server/`（Node ≥ 23 + SQLite，零运行时依赖，Docker 一键起），
后台在 `https://你的域名/admin`：生成激活码 → 线下收款 → 发码给买家 → 买家激活即绑定设备。
完整流程见 [docs/COMMERCIAL-DESIGN.md](docs/COMMERCIAL-DESIGN.md) 与
[license-server/README.md](license-server/README.md)。

## 扩展

看 [docs/EXTENDING.md](docs/EXTENDING.md)：三十行代码新增一个 App，
一个对象新增一个服务商，一组 CSS 变量新增一套主题。

## 授权

- 本项目代码为**原创实现**，未复制任何第三方项目的代码、文案或美术资源。
- 本项目自身的授权由你决定（建议在正式发布前选定 MIT / Apache-2.0 等）。
