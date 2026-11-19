/** 全局共享领域类型 */

export interface Character {
  id: string;
  name: string;
  /** emoji 或图片 URL */
  avatar: string;
  /** 一句话简介，会进入系统 Prompt */
  tagline: string;
  /** 完整角色设定（人设、口癖、背景故事……） */
  systemPrompt: string;
  /** 长期记忆：关于用户与你们的经历，会注入系统 Prompt（可手动维护，也可在聊天里让 AI 总结） */
  memory?: string;
  /** 开场白：会话为空时自动作为第一条消息发出 */
  firstMessage?: string;
  /** 对话示例：示范语气和口癖，注入系统提示词（模仿风格，不照抄内容） */
  exampleDialogue?: string;
  /** 绑定的世界书 id 列表（背景知识注入，见 core/worldbook.ts） */
  worldbookIds?: string[];
  /** 主动消息：角色是否会主动发消息找你（默认开启，见 ai/proactive.ts） */
  proactiveEnabled?: boolean;
  /** 作息·入睡时间 HH:mm（区间内不发主动消息；留空 = 全天可发） */
  sleepFrom?: string;
  /** 作息·起床时间 HH:mm */
  sleepTo?: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}
