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
  /** 长期记忆：关于用户与你们的经历，会注入系统 Prompt（可手动维护） */
  memory?: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}
