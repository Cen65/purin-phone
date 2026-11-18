import { useState } from "react";
import type { AppProps } from "../types";
import { useSettingsStore } from "../../state/settingsStore";
import { listProviders, getProvider } from "../../ai/providers";
import { PROVIDER_PRESETS } from "../../ai/presets";
import { getThemes } from "../../theme/themes";
import { ENTITLEMENT_STATUS_LABELS, getEntitlementProvider } from "../../core/entitlement";
import { Section, Field } from "../ui";

/**
 * 设置 App：AI 服务（含服务商预设）、聊天、外观、用户画像。
 * 新注册的 Provider / 主题会自动出现在下拉框里——注册表模式的直接收益。
 */
export default function SettingsApp(_props: AppProps) {
  const api = useSettingsStore((s) => s.api);
  const persona = useSettingsStore((s) => s.persona);
  const themeId = useSettingsStore((s) => s.themeId);
  const windowSize = useSettingsStore((s) => s.windowSize);
  const setApi = useSettingsStore((s) => s.setApi);
  const setPersona = useSettingsStore((s) => s.setPersona);
  const setThemeId = useSettingsStore((s) => s.setThemeId);
  const setWindowSize = useSettingsStore((s) => s.setWindowSize);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [unbindMessage, setUnbindMessage] = useState<string | null>(null);

  const providers = listProviders();
  const themes = getThemes();

  const entitlement = getEntitlementProvider();
  const entitlementState = entitlement.describe();
  const entitlementText = [
    `${ENTITLEMENT_STATUS_LABELS[entitlementState.status]}（${entitlement.label}）`,
    entitlementState.plan ? `套餐：${entitlementState.plan}` : null,
    entitlementState.expiresAt
      ? `有效期至：${new Date(entitlementState.expiresAt).toLocaleDateString()}`
      : null,
    entitlementState.message ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const runTest = async () => {
    const provider = getProvider(api.provider) ?? getProvider("openai-compatible");
    if (!provider?.testConnection) {
      setTestResult("该 Provider 未实现连接测试");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await provider.testConnection({ ...api });
      setTestResult(result.message);
    } finally {
      setTesting(false);
    }
  };

  const runUnbind = async () => {
    if (!entitlement.deactivate || unbinding) return;
    if (!window.confirm("确定解绑本设备？解绑后可在新设备上用同一激活码重新激活（有效期不变）。")) return;
    setUnbinding(true);
    setUnbindMessage(null);
    try {
      const outcome = await entitlement.deactivate();
      setUnbindMessage(outcome.message ?? (outcome.status === "unactivated" ? "已解绑" : "解绑失败"));
    } finally {
      setUnbinding(false);
    }
  };

  const loadModels = async () => {
    const provider = getProvider(api.provider) ?? getProvider("openai-compatible");
    if (!provider?.listModels) {
      setModels([]);
      return;
    }
    setLoadingModels(true);
    try {
      setModels(await provider.listModels({ ...api }));
    } catch (error) {
      setModels([]);
      setTestResult(`拉取模型失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="settings">
      <Section title="AI 服务">
        <Field label="常用服务商" hint="点一下自动填 Base URL 和推荐模型，Key 还是要自己填">
          <div className="preset-row">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`chip ${api.baseUrl === preset.baseUrl ? "chip-on" : ""}`}
                onClick={() => setApi({ baseUrl: preset.baseUrl, model: preset.models[0] ?? api.model })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="接口类型" hint="OpenAI 兼容接口适用于 OpenAI / DeepSeek / 通义 / 各类中转站">
          <select value={api.provider} onChange={(event) => setApi({ provider: event.target.value })}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Base URL" hint="一般以 /v1 结尾，例如 https://api.deepseek.com/v1">
          <input
            value={api.baseUrl}
            placeholder="https://example.com/v1"
            onChange={(event) => setApi({ baseUrl: event.target.value.trim() })}
          />
        </Field>
        <Field label="API Key" hint="只保存在本机浏览器，不会上传">
          <div className="inline-row">
            <input
              type={showKey ? "text" : "password"}
              value={api.apiKey}
              placeholder="sk-…"
              onChange={(event) => setApi({ apiKey: event.target.value.trim() })}
            />
            <button type="button" className="secondary" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </Field>
        <Field label="模型" hint="可手动填写，或点击「拉取模型」从服务端获取">
          <div className="inline-row">
            {models.length > 0 ? (
              <select value={api.model} onChange={(event) => setApi({ model: event.target.value })}>
                {!models.includes(api.model) && <option value={api.model}>{api.model || "（选择模型）"}</option>}
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={api.model}
                placeholder="例如 deepseek-chat"
                onChange={(event) => setApi({ model: event.target.value.trim() })}
              />
            )}
            <button type="button" className="secondary" onClick={() => void loadModels()} disabled={loadingModels}>
              {loadingModels ? "拉取中…" : "拉取模型"}
            </button>
          </div>
        </Field>
        <div className="inline-row">
          <button type="button" className="primary" onClick={() => void runTest()} disabled={testing}>
            {testing ? "测试中…" : "测试连接"}
          </button>
          {testResult && <span className="test-result">{testResult}</span>}
        </div>
      </Section>

      <Section title="我">
        <Field label="昵称" hint="AI 会这样称呼你">
          <input
            value={persona.nickname}
            placeholder="你的昵称"
            onChange={(event) => setPersona({ nickname: event.target.value })}
          />
        </Field>
      </Section>

      <Section title="聊天">
        <Field label="上下文条数" hint="每次请求带给 AI 的最近消息条数；更省额度调小，更记得住前文调大">
          <select value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value))}>
            {[10, 20, 40, 80].map((size) => (
              <option key={size} value={size}>
                最近 {size} 条
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="外观">
        <Field label="主题">
          <select value={themeId} onChange={(event) => setThemeId(event.target.value)}>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="关于">
        <Field label="授权状态" hint="商用激活码方案接入点，见 docs/COMMERCIAL-DESIGN.md">
          <p className="about-text">{entitlementText}</p>
          {entitlement.id === "license-server" && entitlementState.status === "active" ? (
            <button
              type="button"
              className="secondary"
              disabled={unbinding}
              onClick={() => void runUnbind()}
            >
              {unbinding ? "解绑中…" : "解绑本设备（换设备用）"}
            </button>
          ) : null}
          {unbindMessage ? <p className="about-text">{unbindMessage}</p> : null}
        </Field>
        <p className="about-text">
          布丁机 Purin v0.1.0 —— 一部跑在浏览器里的虚拟手机。
          桌面上的每个应用都通过 App 注册表接入，欢迎按 docs/EXTENDING.md 写一个自己的 App。
        </p>
      </Section>
    </div>
  );
}
