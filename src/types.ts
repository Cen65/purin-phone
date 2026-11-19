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
  /** 印象档案：角色视角对用户的印象（TA 是个怎样的人），注入系统 Prompt 影响态度；聊天页 👁 可生成/编辑 */
  impression?: string;
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
  /** 说话篇幅：short（默认，一两句）| medium（两三句）| long（四五句） */
  styleLength?: "short" | "medium" | "long";
  /** 允许偶尔使用 emoji / 颜文字（默认不用） */
  styleEmoticon?: boolean;
  /** 允许偶尔使用（括号小动作）神态描写（默认不用） */
  styleAction?: boolean;
  /** 记忆游标：最后一次被记忆巩固消费掉的消息 id（见 ai/memory.ts 自动巩固） */
  memoryCursor?: string;
  /** 好感度 0~100（默认 50）：随每条用户消息按关键词增减，注入提示词影响语气（见 ai/affection.ts） */
  affection?: number;
  /** 心情标签（开心/平静/有点低落/难过）：由最近一次好感增减推导，注入提示词 */
  mood?: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}
