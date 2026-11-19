/**
 * AI 层类型：Provider 接口是唯一的扩展契约。
 * 任何 LLM 服务（OpenAI 兼容、Anthropic、Gemini、本地模型……）
 * 只要实现 LLMProvider 并注册，全端即可选用。
 */

export type ChatRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: ChatRole;
  content: string;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatRequest extends ProviderConfig {
  messages: LLMMessage[];
  signal?: AbortSignal;
  temperature?: number;
  /** 提供流式增量回调；不传则一次性返回完整文本 */
  onDelta?: (delta: string) => void;
}

export interface ChatResult {
  content: string;
}

export interface ImageGenRequest extends ProviderConfig {
  /** 生图模型（与聊天模型分开配置，见 settingsStore.imageModel） */
  prompt: string;
  /** 如 "1024x1024"；不传由服务端决定 */
  size?: string;
}

export interface ImageGenResult {
  /** 图片 data URL（base64），统一走本地 IndexedDB 存储 */
  dataUrl: string;
}

export interface LLMProvider {
  id: string;
  label: string;
  chat(request: ChatRequest): Promise<ChatResult>;
  /** 可选：文生图（OpenAI 兼容 /images/generations 协议，P4） */
  generateImage?(request: ImageGenRequest): Promise<ImageGenResult>;
  listModels?(config: ProviderConfig, signal?: AbortSignal): Promise<string[]>;
  testConnection?(config: ProviderConfig): Promise<{ ok: boolean; message: string }>;
}
