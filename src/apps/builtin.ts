import { registerApp } from "./registry";
import ChatApp from "./chat/ChatApp";
import ContactsApp from "./contacts/ContactsApp";
import MomentsApp from "./moments/MomentsApp";
import NotesApp from "./notes/NotesApp";
import SettingsApp from "./settings/SettingsApp";

/**
 * 内置 App 注册。第三方/实验性 App 未来在这里追加 registerApp 即可上桌面。
 */
export function registerBuiltinApps(): void {
  registerApp({
    id: "chat",
    name: "聊天",
    icon: "💬",
    version: "0.2.0",
    description: "和 AI 角色私聊、群聊",
    category: "social",
    order: 10,
    component: ChatApp,
  });
  registerApp({
    id: "contacts",
    name: "联系人",
    icon: "👥",
    version: "0.2.0",
    description: "管理你的 AI 角色，支持角色卡",
    category: "social",
    order: 20,
    component: ContactsApp,
  });
  registerApp({
    id: "moments",
    name: "朋友圈",
    icon: "🌟",
    version: "0.1.0",
    description: "角色们的动态：点赞、评论",
    category: "social",
    order: 40,
    component: MomentsApp,
  });
  registerApp({
    id: "notes",
    name: "便签",
    icon: "📝",
    version: "0.1.0",
    description: "最简 App 示例",
    category: "tools",
    order: 30,
    component: NotesApp,
  });
  registerApp({
    id: "settings",
    name: "设置",
    icon: "⚙️",
    version: "0.1.0",
    description: "AI 服务、外观与个人信息",
    category: "system",
    order: 90,
    component: SettingsApp,
  });
}
