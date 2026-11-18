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

export interface LLMProvider {
  id: string;
  label: string;
  chat(request: ChatRequest): Promise<ChatResult>;
  listModels?(config: ProviderConfig, signal?: AbortSignal): Promise<string[]>;
  testConnection?(config: ProviderConfig): Promise<{ ok: boolean; message: string }>;
}
