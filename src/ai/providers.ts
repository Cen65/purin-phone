import type { LLMProvider } from "./types";
import { openaiCompatibleProvider } from "./openaiCompatible";

/**
 * Provider 注册表：AI 能力的扩展入口。
 * 新增模型服务 = 实现 LLMProvider + registerProvider，设置页会自动出现。
 */
const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): LLMProvider | undefined {
  return providers.get(id);
}

export function listProviders(): LLMProvider[] {
  return [...providers.values()];
}

// 内置：OpenAI 兼容
registerProvider(openaiCompatibleProvider);
