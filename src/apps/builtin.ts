import { registerApp } from "./registry";
import ChatApp from "./chat/ChatApp";
import ContactsApp from "./contacts/ContactsApp";
import SettingsApp from "./settings/SettingsApp";
import StoreApp from "./store/StoreApp";

/**
 * 基础 App（系统自带，不可卸载）：聊天 / 联系人 / 商店 / 设置。
 * 朋友圈、便签、世界书、天气、纪念日等扩展能力在「应用商店」里按需安装，
 * 目录定义见 src/apps/extensions.ts。
 */
export function registerBuiltinApps(): void {
  registerApp({
    id: "chat",
    name: "聊天",
    icon: "💬",
    version: "0.3.0",
    description: "和 AI 角色私聊、群聊",
    category: "social",
    order: 10,
    component: ChatApp,
  });
  registerApp({
    id: "contacts",
    name: "联系人",
    icon: "👥",
    version: "0.3.0",
    description: "管理你的 AI 角色，支持角色卡与 AI 捏人",
    category: "social",
    order: 20,
    component: ContactsApp,
  });
  registerApp({
    id: "store",
    name: "应用商店",
    icon: "🛍️",
    version: "0.1.0",
    description: "安装和卸载扩展应用",
    category: "system",
    order: 45,
    component: StoreApp,
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
