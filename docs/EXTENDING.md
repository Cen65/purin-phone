# 扩展指南

底座的一切扩展点都是"注册制"：写一个符合类型的对象，调用一次注册函数，完成。
不需要修改 `src/phone`、`src/state` 或任何已有 App 的代码。

---

## 1. 新增一个 App

一个 App = 一个 React 组件 + 一份清单（manifest）。在任何地方（推荐 `src/apps/你的App/`）
创建组件文件：

```tsx
// src/apps/todo/TodoApp.tsx
import { useState } from "react";
import type { AppProps } from "../types";
import { EmptyHint } from "../ui";

export default function TodoApp({ appId }: AppProps) {
  const [items, setItems] = useState<string[]>([]);
  const [text, setText] = useState("");
  return (
    <div className="editor">
      <h3>待办（appId={appId}）</h3>
      <div className="inline-row">
        <input value={text} onChange={(e) => setText(e.target.value)} />
        <button
          className="primary"
          onClick={() => {
            setItems((prev) => [...prev, text]);
            setText("");
          }}
        >
          添加
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyHint>还没有待办</EmptyHint>
      ) : (
        <ul className="note-list">
          {items.map((item, index) => (
            <li key={index} className="note-card">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

注册（例如在自己的 `index.ts` 里，或在 `src/apps/builtin.ts` 中追加）：

```ts
import { registerApp } from "../registry";
import TodoApp from "./TodoApp";

registerApp({
  id: "todo",              // 唯一 id，重复注册会抛错
  name: "待办",
  icon: "✅",
  version: "0.1.0",
  order: 40,               // 桌面排序，越小越靠前；默认 100
  category: "tools",       // system | social | tools | media | game
  component: TodoApp,
});
```

刷新桌面即可看到。完整字段见 `src/apps/types.ts` 的 `AppManifest`。

### App 能拿到什么

| 能力 | 用法 |
| --- | --- |
| 打开参数 | `usePhoneStore((s) => s.params["todo"])` —— 别人 `openApp("todo", { filter: "today" })` 传进来的对象 |
| 发通知 | `bus.emit("notify", { appId: "todo", title: "提醒", body: "该喝水了" })` |
| 角标 | `usePhoneStore.getState().bumpBadge("todo")`，用户打开 App 时自动清零 |
| 打开别的 App | `usePhoneStore.getState().openApp("chat", { characterId })` —— 这是 App 之间唯一的"跳转"方式 |
| 监听全局事件 | `bus.on("chat:reply-finished", ({ characterId, content }) => { ... })`（记得在 useEffect 清理中取消订阅） |

### 最佳实践

- App 自己的状态放自己的文件里（参考 `src/apps/notes/NotesApp.tsx` 自带局部 store 的写法），不要塞进全局 store。
- 持久化 key 用 `purin.你的App名` 命名空间（旧 `my-phone.*` key 会在启动时自动迁移，见 `src/core/storage.ts`）。
- 列表可能为空时给 `EmptyHint`；可能出错时自己 try/catch，别让错误冒泡到 ErrorBoundary（那是最后防线）。

---

## 2. 新增一个 AI 服务商

实现 `src/ai/types.ts` 的 `LLMProvider` 接口，然后注册。以一个假想的 "echo" 服务为例：

```ts
// src/ai/echoProvider.ts
import type { LLMProvider } from "./types";

export const echoProvider: LLMProvider = {
  id: "echo",
  label: "回声服务（示例）",
  async chat(request) {
    const last = request.messages.at(-1)?.content ?? "";
    let full = "";
    for (const char of `你说的是：${last}`) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      full += char;
      request.onDelta?.(char);          // 流式增量（有就调，没有就一次性返回）
    }
    return { content: full };
  },
  async listModels() {
    return ["echo-mini", "echo-pro"];
  },
  async testConnection(config) {
    return { ok: true, message: "回声服务永远在线" };
  },
};
```

```ts
import { registerProvider } from "./providers";
import { echoProvider } from "./echoProvider";

registerProvider(echoProvider);
```

注册后设置页的"服务商"下拉框会自动出现它，无需改任何 UI 代码。
真实参考实现看 `src/ai/openaiCompatible.ts`（SSE 解析、整段 JSON 兼容、错误处理都有），
单测看 `src/ai/openaiCompatible.test.ts`——新 Provider 建议照抄这组测试的骨架。

---

## 3. 新增一套主题

主题 = 一组 CSS 变量。所有组件样式只引用变量，换主题即换肤。

```ts
// 任意地方（推荐 src/theme/themes.ts 旁）
import { registerTheme } from "../theme/themes";

registerTheme({
  id: "sakura",
  label: "樱花",
  mode: "light",
  vars: {
    "c-bg": "#fdf2f6",
    "c-surface": "#ffffff",
    "c-accent": "#e5679a",
    "c-bubble-user": "#e5679a",
    "home-wall": "linear-gradient(160deg, #ffe3ee, #fff7f9)",
    // ……完整变量清单看 src/theme/themes.ts 内置主题（键不带 -- 前缀）
  },
});
```

注册后设置 → 外观的切换列表自动出现。深色模式记得把 `mode` 设为 `"dark"`，
状态栏等处的对比色会跟随 `data-theme-mode` 属性调整。

### 主题包（JSON 导入导出）

主题可序列化成 `purin.theme` JSON 分享：设置 → 外观里有导出/导入按钮；
代码里用 `exportTheme(theme)` / `parseThemePack(json)`（`src/theme/themes.ts`）。

```json
{
  "type": "purin.theme",
  "version": 1,
  "id": "sakura",
  "label": "樱花",
  "mode": "light",
  "vars": { "c-bg": "#fdf2f6", "c-accent": "#e5679a", "...": "其余变量" }
}
```

校验规则：`id` 合法（小写字母数字连字符）、`label` 非空、`mode` ∈ light/dark、
`vars` 1~40 项且键匹配 `/^[a-z0-9][a-z0-9-]{1,29}$/`、值非空。不合规则抛
「主题包格式不正确」。导入的主题只在当前会话生效（想常驻就照上面写进代码注册）。

---

## 3.5 给角色挂世界书

世界书 = 背景知识库，条目按三种方式触发后注入提示词（`src/core/worldbook.ts`）：

- **常驻（always）**：每次对话都注入（世界观类）；
- **关键词（keyword）**：最近 8 条消息提到任一触发词才注入；
- **正则（regex）**：最近消息匹配正则才注入（无效正则静默不触发）。

每个条目有 `priority`（越大越靠前）和 `position`：`system` 拼进主提示词、
`context` 作为「此刻的背景补充」插在最近一条用户消息前。挂载方式：角色编辑/
世界书 App 里勾选；群聊取全体成员绑定书的**并集**。数据在
`src/state/worldbookStore.ts`（persist key `purin.worldbooks`），绑定关系存在
`Character.worldbookIds` / `Group.worldbookIds` 上，删书自动清理引用。

交换格式两种：JSON（`{type:"purin.worldbook", version:1, entries:[...]}`）和
纯文本（块间 `---` 分隔，块内 `@常驻` / `@关键词: a,b` / `@正则: x` /
`@优先级: 10` / `@位置: 近对话` 指令行 + 正文），见 `parseWorldbookJson` /
`parseWorldbookText`。

---

## 4. 新增一个全局事件

系统事件集中在 `src/core/events.ts` 的 `PhoneEvents`。当前已有：

```ts
export interface PhoneEvents {
  notify: { appId?: string; title: string; body?: string; kind?: "info" | "error" };
  "chat:reply-finished": { characterId: string; content: string };
  "call:incoming": { characterId: string };        // 来电开始（ContactsApp 拨号时发出，CallHost 呈现）
  "moments:posted": { momentId: string; authorName: string };  // 新动态发布（AI 生成或手动）
  // 新增：
  "todo:done": { todoId: string; at: number };
}
```

之后任何模块都能 `bus.emit("todo:done", {...})` / `bus.on("todo:done", ...)`，
全程类型安全。如果事件只属于你自己的 App，也可以用 `createEventBus<YourEvents>()`
创建一个私有总线，不污染系统事件表。

> 角色卡格式提示：导入导出走 `src/state/charactersStore.ts` 的
> `toCard()` / `parseCard()`，格式为 `{type:"purin.character", version:1, ...}`
> （v1.1 可选字段 `firstMessage` 开场白、`exampleDialogue` 对话示例、`memory` 记忆种子；
> 导入兼容旧 `my-phone.character`；另有 `parseCharacterText()` 支持 .txt/.md 标签式文本），
> 想做角色卡生态时直接复用这个 Schema。

---

## 5. 更换存储层（localStorage → IndexedDB）

所有持久化都经过 `src/core/storage.ts` 的 `safeLocalStorage` 适配层。
引入 Dexie（或手写 IndexedDB 适配）实现同样的 `StateStorage` 接口，
替换 `createJSONStorage(safeLocalStorage)` 一处调用即可，各 store 无需改动。
建议在 P2 阶段做，配套写一个旧数据迁移函数。

---

## 6. 新增授权模式（商用接缝）

商用激活码/账号系统全部收敛在 `src/core/entitlement.ts` 的 `EntitlementProvider` 接口上。
默认生效的是开放模式（`openEntitlementProvider`，不限制任何使用）。

**已内置一套完整实现**：`src/core/licenseServerProvider.ts` 对接
`purin/license-server/`（激活码 + 一码一设备），由 `public/commercial.json` 的
`mode: "licensed"` 一键启用——通常你不需要再写 Provider，部署见
`license-server/README.md`，设计见 `docs/COMMERCIAL-DESIGN.md`。

接**另一套**授权系统时，实现同样的接口并在入口注册：

```ts
// src/core/myProvider.ts
import type { EntitlementProvider } from "./entitlement";

export const myProvider: EntitlementProvider = {
  id: "my-auth",
  label: "我的授权",
  describe() { /* 同步返回当前授权快照（缓存 + 离线宽限判断） */ },
  async activate(code, device) { /* 调你的服务端，返回 { status, token?, plan?, expiresAt? } */ },
  async refresh(device) { /* 心跳/续验，可选 */ },
  async deactivate() { /* 解绑/登出，可选 */ },
};
```

```ts
// src/main.tsx 的 bootstrap() 里，渲染前：
import { registerEntitlementProvider } from "./core/entitlement";
registerEntitlementProvider(myProvider, { activateImmediately: true });
```

配套改动：未激活时会由 `src/phone/ActivationGate.tsx` 自动挡在桌面之前
（它只认 provider 的 `describe().status`，无需改）。
完整设计（数据模型 / API / 防滥用 / 管理后台）看 `docs/COMMERCIAL-DESIGN.md`。

---

## 7. 测试约定

- 核心逻辑（解析、状态机、注册表、提示词）必须带 `*.test.ts` 单测，与源文件同目录。
- 运行：`pnpm test`（vitest 已配置进程内 threads 池，兼容受限环境）。
- mock `fetch` 用 `vi.stubGlobal`，流式响应用 `ReadableStream` 手造 chunk，
  参见 `src/ai/openaiCompatible.test.ts`。
- zustand store 测试直接 `useStore.getState()` 调 action 后断言，注意各测试间
  store 是全局单例，用独立的 conversationId / 注册后清理，避免互相污染。
