/**
 * 服务商预设（P1）：常见 OpenAI 兼容服务的一键填充。
 * 只填 baseUrl 和候选模型，Key 仍由用户自己填（不内置任何密钥）。
 */

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
  },
  {
    id: "moonshot",
    label: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "kimi-k2-0711-preview"],
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-7B-Instruct"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini", "deepseek/deepseek-chat"],
  },
  {
    id: "ollama",
    label: "本地 Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: ["qwen2.5:7b", "llama3.1:8b"],
  },
];
