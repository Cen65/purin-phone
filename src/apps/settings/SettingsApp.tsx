import { useRef, useState } from "react";
import type { AppProps } from "../types";
import { useSettingsStore } from "../../state/settingsStore";
import { listProviders, getProvider } from "../../ai/providers";
import { PROVIDER_PRESETS } from "../../ai/presets";
import { getThemes, getTheme, registerTheme, exportTheme, parseThemePack } from "../../theme/themes";
import { ENTITLEMENT_STATUS_LABELS, getEntitlementProvider } from "../../core/entitlement";
import { downloadTextFile } from "../../core/download";
import { downloadBackup, restoreBackup } from "../../core/backup";
import { speak, ttsSupported } from "../../core/tts";
import { useProactiveStore } from "../../state/proactiveStore";
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
  const imageModel = useSettingsStore((s) => s.imageModel);
  const voiceAutoSpeak = useSettingsStore((s) => s.voiceAutoSpeak);
  const memoryAuto = useSettingsStore((s) => s.memoryAuto);
  const engineOn = useProactiveStore((s) => s.engineOn);
  const gapMinutes = useProactiveStore((s) => s.gapMinutes);
  const momentsOn = useProactiveStore((s) => s.momentsOn);
  const momentGapMinutes = useProactiveStore((s) => s.momentGapMinutes);
  const setEngineOn = useProactiveStore((s) => s.setEngineOn);
  const setGapMinutes = useProactiveStore((s) => s.setGapMinutes);
  const setMomentsOn = useProactiveStore((s) => s.setMomentsOn);
  const setMomentGapMinutes = useProactiveStore((s) => s.setMomentGapMinutes);
  const setApi = useSettingsStore((s) => s.setApi);
  const setPersona = useSettingsStore((s) => s.setPersona);
  const setThemeId = useSettingsStore((s) => s.setThemeId);
  const setWindowSize = useSettingsStore((s) => s.setWindowSize);
  const setImageModel = useSettingsStore((s) => s.setImageModel);
  const setVoiceAutoSpeak = useSettingsStore((s) => s.setVoiceAutoSpeak);
  const setMemoryAuto = useSettingsStore((s) => s.setMemoryAuto);

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [unbindMessage, setUnbindMessage] = useState<string | null>(null);
  const [themeImport, setThemeImport] = useState("");
  const [themeMessage, setThemeMessage] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  const applyImportedTheme = async () => {
    try {
      const pack = parseThemePack(themeImport);
      registerTheme(pack);
      setThemeId(pack.id);
      setThemeMessage(`已应用主题「${pack.label}」（本次会话）`);
    } catch (error) {
      setThemeMessage(error instanceof Error ? error.message : String(error));
    }
  };

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
        <Field
          label="生图模型（可选）"
          hint="填了才能在聊天里用「/画 xxx」生图，例如 Kwai-Kolors、dall-e-3；留空 = 不启用"
        >
          <input
            value={imageModel}
            placeholder="例如 Kwai-Kolors / dall-e-3"
            onChange={(event) => setImageModel(event.target.value.trim())}
          />
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
        <Field label="主动消息" hint="角色会自己找话题给你发消息（应用打开期间）；每个角色的开关在联系人编辑页">
          <div className="inline-row">
            <button type="button" className="secondary" onClick={() => setEngineOn(!engineOn)}>
              {engineOn ? "已开启（点击关闭）" : "已关闭（点击开启）"}
            </button>
            <select value={gapMinutes} onChange={(event) => setGapMinutes(Number(event.target.value))}>
              {[60, 120, 240, 480].map((minutes) => (
                <option key={minutes} value={minutes}>
                  间隔约 {minutes < 60 ? `${minutes} 分钟` : minutes < 1440 ? `${minutes / 60} 小时` : "1 天"}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="记忆自动巩固" hint="聊过约 12 条后，自动把新对话要点并进角色的长期记忆（也可在聊天里手动点 🧠）">
          <div className="inline-row">
            <button type="button" className="secondary" onClick={() => setMemoryAuto(!memoryAuto)}>
              {memoryAuto ? "已开启（点击关闭）" : "已关闭（点击开启）"}
            </button>
          </div>
        </Field>
        <Field label="朋友圈自动发帖" hint="角色们隔一阵子自己发朋友圈（应用打开期间）；睡眠作息内的角色不发">
          <div className="inline-row">
            <button type="button" className="secondary" onClick={() => setMomentsOn(!momentsOn)}>
              {momentsOn ? "已开启（点击关闭）" : "已关闭（点击开启）"}
            </button>
            <select
              value={momentGapMinutes}
              onChange={(event) => setMomentGapMinutes(Number(event.target.value))}
            >
              {[120, 240, 480, 720].map((minutes) => (
                <option key={minutes} value={minutes}>
                  间隔约 {minutes / 60} 小时
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="上下文条数" hint="每次请求带给 AI 的最近消息条数；更省额度调小，更记得住前文调大">
          <select value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value))}>
            {[10, 20, 40, 80].map((size) => (
              <option key={size} value={size}>
                最近 {size} 条
              </option>
            ))}
          </select>
        </Field>
        <Field label="自动朗读回复" hint={ttsSupported() ? "用浏览器内置语音朗读 AI 回复，也可在聊天页顶部开关" : "当前浏览器不支持语音合成"}>
          <div className="inline-row">
            <button type="button" className="secondary" onClick={() => setVoiceAutoSpeak(!voiceAutoSpeak)}>
              {voiceAutoSpeak ? "已开启（点击关闭）" : "已关闭（点击开启）"}
            </button>
            {ttsSupported() && (
              <button type="button" className="secondary" onClick={() => speak("你好，我是你的小手机，很高兴认识你。")}>
                试听语音
              </button>
            )}
          </div>
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
        <Field label="导出当前主题" hint="导出为 JSON 主题包，可分享给别人导入">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const theme = getTheme(themeId);
              if (!theme) return;
              downloadTextFile(
                `${theme.id}.purin-theme.json`,
                exportTheme(theme),
                "application/json;charset=utf-8",
              );
            }}
          >
            导出主题包
          </button>
        </Field>
        <Field label="导入主题包" hint="粘贴 purin-theme JSON，应用后立即生效（本次会话）">
          <textarea
            rows={3}
            placeholder='{"type":"purin.theme","id":"my-theme",...}'
            value={themeImport}
            onChange={(event) => setThemeImport(event.target.value)}
          />
          <div className="editor-actions">
            <button type="button" className="secondary" disabled={!themeImport.trim()} onClick={() => void applyImportedTheme()}>
              应用主题
            </button>
          </div>
          {themeMessage ? <p className="about-text">{themeMessage}</p> : null}
        </Field>
      </Section>

      <Section title="备份与恢复">
        <Field label="全量备份" hint="导出所有本地数据（角色、聊天、世界书、主题选择、授权绑定）为一个 JSON 文件，换设备/换浏览器时导入即可恢复">
          <button type="button" className="primary" onClick={downloadBackup}>
            导出备份文件
          </button>
        </Field>
        <Field label="恢复备份" hint="导入备份会覆盖当前全部数据，然后自动刷新页面；聊天里的生图图片不在备份内">
          <button type="button" className="secondary" onClick={() => backupFileRef.current?.click()}>
            选择备份文件
          </button>
          <input
            ref={backupFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void file
                .text()
                .then((json) => {
                  const restored = restoreBackup(json);
                  setBackupMessage(`已恢复 ${restored} 项数据，即将刷新页面…`);
                  window.setTimeout(() => window.location.reload(), 800);
                })
                .catch((error: unknown) => {
                  setBackupMessage(error instanceof Error ? error.message : String(error));
                });
            }}
          />
          {backupMessage ? <p className="about-text">{backupMessage}</p> : null}
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
          Purin v0.1.0 —— 一部跑在浏览器里的虚拟手机。
          桌面上的每个应用都通过 App 注册表接入，欢迎按 docs/EXTENDING.md 写一个自己的 App。
        </p>
      </Section>
    </div>
  );
}
