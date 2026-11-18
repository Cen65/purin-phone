import { useRef, useState } from "react";
import type { AppProps } from "../types";
import {
  useCharactersStore,
  type CharacterDraft,
  toCard,
  parseCard,
  parseCharacterText,
} from "../../state/charactersStore";
import { useChatStore } from "../../state/chatStore";
import { useCallStore } from "../../state/callStore";
import { usePhoneStore } from "../../state/phoneStore";
import { useSettingsStore, isApiReady } from "../../state/settingsStore";
import { forgeCharacter } from "../../ai/characterForge";
import { downloadTextFile } from "../../core/download";
import { bus } from "../../core/events";
import { EmptyHint } from "../ui";

/**
 * 联系人 App：角色（Character）的增删改查 + 角色卡导入导出 + AI 捏人 + 拨打电话。
 * 点名字进聊天；📞 发起模拟来电（CallHost 接管界面）。
 */
export default function ContactsApp(_props: AppProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [forging, setForging] = useState(false);

  if (forging) {
    return (
      <ForgeWizard
        onDone={() => setForging(false)}
        onManual={() => {
          setForging(false);
          setCreating(true);
        }}
      />
    );
  }
  if (creating || editingId) {
    return (
      <CharacterEditor
        characterId={editingId}
        onDone={() => {
          setCreating(false);
          setEditingId(null);
        }}
      />
    );
  }
  return (
    <ContactList
      onEdit={(id) => setEditingId(id)}
      onCreate={() => setCreating(true)}
      onForge={() => setForging(true)}
    />
  );
}

function ContactList({
  onEdit,
  onCreate,
  onForge,
}: {
  onEdit: (id: string) => void;
  onCreate: () => void;
  onForge: () => void;
}) {
  const characters = useCharactersStore((s) => s.characters);
  const addCharacter = useCharactersStore((s) => s.addCharacter);
  const openApp = usePhoneStore((s) => s.openApp);
  const startIncoming = useCallStore((s) => s.startIncoming);
  const fileRef = useRef<HTMLInputElement>(null);

  async function importCard(file: File) {
    try {
      const text = await file.text();
      const draft = file.name.endsWith(".json") ? parseCard(text) : parseCharacterText(text);
      const character = addCharacter(draft);
      bus.emit("notify", { appId: "contacts", title: "导入成功", body: `已添加角色「${character.name}」` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bus.emit("notify", { kind: "error", title: "导入失败", body: message.slice(0, 80) });
    }
  }

  return (
    <div className="contacts">
      <div className="contacts-actions">
        <button type="button" className="primary" onClick={onCreate}>
          ＋ 新建角色
        </button>
        <button type="button" className="secondary" onClick={onForge}>
          ✨ AI 捏角色
        </button>
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          导入角色卡
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,.md,application/json,text/plain,text/markdown"
          className="hidden-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importCard(file);
            e.target.value = "";
          }}
        />
      </div>
      {characters.length === 0 && <EmptyHint>暂无联系人，点上方按钮创建第一个角色吧</EmptyHint>}
      <ul className="contact-list">
        {characters.map((character) => (
          <li key={character.id} className="contact-row">
            <button
              type="button"
              className="contact-main"
              onClick={() => openApp("chat", { characterId: character.id })}
            >
              <span className="avatar">{character.avatar}</span>
              <span className="contact-info">
                <span className="contact-name">{character.name}</span>
                <span className="contact-tagline">{character.tagline || "（无简介）"}</span>
              </span>
            </button>
            <span className="contact-tools">
              <button
                type="button"
                className="icon-btn"
                title={`给 ${character.name} 打电话`}
                aria-label={`给 ${character.name} 打电话`}
                onClick={() => {
                  startIncoming(character.id);
                  bus.emit("call:incoming", { characterId: character.id });
                }}
              >
                📞
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onEdit(character.id)}
                aria-label={`编辑 ${character.name}`}
              >
                ✏️
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CharacterEditor({ characterId, onDone }: { characterId: string | null; onDone: () => void }) {
  const character = useCharactersStore((s) => s.characters.find((c) => c.id === characterId));
  const { addCharacter, updateCharacter, removeCharacter } = useCharactersStore.getState();
  const clearConversation = useChatStore((s) => s.clearConversation);
  const [draft, setDraft] = useState<CharacterDraft>({
    name: character?.name ?? "",
    avatar: character?.avatar ?? "🙂",
    tagline: character?.tagline ?? "",
    systemPrompt: character?.systemPrompt ?? "",
    memory: character?.memory ?? "",
    firstMessage: character?.firstMessage ?? "",
    exampleDialogue: character?.exampleDialogue ?? "",
  });

  const save = () => {
    if (!draft.name.trim()) return;
    const cleaned: CharacterDraft = {
      ...draft,
      memory: draft.memory?.trim() || undefined,
      firstMessage: draft.firstMessage?.trim() || undefined,
      exampleDialogue: draft.exampleDialogue?.trim() || undefined,
    };
    if (character) {
      updateCharacter(character.id, cleaned);
    } else {
      addCharacter(cleaned);
    }
    onDone();
  };

  return (
    <div className="editor">
      <div className="editor-row">
        <label className="field avatar-field">
          <span className="field-label">头像（emoji）</span>
          <input
            value={draft.avatar}
            maxLength={4}
            onChange={(event) => setDraft({ ...draft, avatar: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">名字</span>
          <input
            value={draft.name}
            placeholder="角色名字"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">一句话简介</span>
        <input
          value={draft.tagline}
          placeholder="例如：高冷的猫咖店主"
          onChange={(event) => setDraft({ ...draft, tagline: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">角色设定（会作为系统提示词）</span>
        <textarea
          rows={8}
          value={draft.systemPrompt}
          placeholder={"性格、说话风格、背景故事、与用户的关系……\n例如：表面高冷实则关心人，喜欢用反问句，养了一只叫「布丁」的猫。"}
          onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">长期记忆（会和设定一起注入提示词，可在聊天里点 🧠 自动总结）</span>
        <textarea
          rows={4}
          value={draft.memory ?? ""}
          placeholder={"你们之间发生过的事……\n例如：用户喜欢在深夜找我聊天；上个月一起养了猫。"}
          onChange={(event) => setDraft({ ...draft, memory: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">开场白（打开会话时自动说的第一句话）</span>
        <input
          value={draft.firstMessage ?? ""}
          placeholder="例如：你来啦？我刚好泡好茶。"
          onChange={(event) => setDraft({ ...draft, firstMessage: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">对话示例（示范语气和口癖，不照抄内容）</span>
        <textarea
          rows={4}
          value={draft.exampleDialogue ?? ""}
          placeholder={"用户：在忙吗？\n角色：在等你消息呢，说吧。"}
          onChange={(event) => setDraft({ ...draft, exampleDialogue: event.target.value })}
        />
      </label>
      <div className="editor-actions">
        <button type="button" className="primary" onClick={save} disabled={!draft.name.trim()}>
          保存
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          取消
        </button>
        {character && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              downloadTextFile(
                `${character.name}.角色卡.json`,
                JSON.stringify(toCard(character), null, 2),
                "application/json;charset=utf-8",
              )
            }
          >
            导出角色卡
          </button>
        )}
        {character && (
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!window.confirm(`删除「${character.name}」及其全部聊天记录？`)) return;
              removeCharacter(character.id);
              clearConversation(character.id);
              onDone();
            }}
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * AI 捏人向导：填几个关键词，让 AI 生成一份角色设定，预览可改，满意再保存。
 */
function ForgeWizard({ onDone, onManual }: { onDone: () => void; onManual: () => void }) {
  const api = useSettingsStore((s) => s.api);
  const addCharacter = useCharactersStore((s) => s.addCharacter);
  const [form, setForm] = useState({
    gender: "",
    age: "",
    personality: "",
    speakingStyle: "",
    relationship: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CharacterDraft | null>(null);

  const ready = isApiReady(api);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const forged = await forgeCharacter({
        gender: form.gender.trim() || undefined,
        age: form.age.trim() || undefined,
        personality: form.personality.trim() || undefined,
        speakingStyle: form.speakingStyle.trim() || undefined,
        relationship: form.relationship.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setResult({
        name: forged.name,
        avatar: forged.avatar,
        tagline: forged.tagline,
        systemPrompt: forged.systemPrompt,
        memory: forged.memory,
        firstMessage: forged.firstMessage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!result?.name.trim()) return;
    const character = addCharacter({
      ...result,
      memory: result.memory?.trim() || undefined,
      firstMessage: result.firstMessage?.trim() || undefined,
    });
    bus.emit("notify", { appId: "contacts", title: "角色已创建", body: `「${character.name}」加入联系人` });
    onDone();
  };

  if (!ready) {
    return (
      <div className="editor">
        <EmptyHint>AI 捏人需要先配置 AI 服务（API 地址 / Key / 模型）。</EmptyHint>
        <div className="editor-actions">
          <button type="button" className="primary" onClick={onManual}>
            手动创建
          </button>
          <button type="button" className="secondary" onClick={onDone}>
            返回
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="editor">
        <h3 className="forge-title">✨ 预览 · 满意就保存</h3>
        <div className="editor-row">
          <label className="field avatar-field">
            <span className="field-label">头像</span>
            <input
              value={result.avatar}
              maxLength={4}
              onChange={(e) => setResult({ ...result, avatar: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">名字</span>
            <input value={result.name} onChange={(e) => setResult({ ...result, name: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">一句话简介</span>
          <input value={result.tagline} onChange={(e) => setResult({ ...result, tagline: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">角色设定</span>
          <textarea
            rows={6}
            value={result.systemPrompt}
            onChange={(e) => setResult({ ...result, systemPrompt: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">开场白</span>
          <input
            value={result.firstMessage ?? ""}
            onChange={(e) => setResult({ ...result, firstMessage: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">初始记忆</span>
          <textarea
            rows={2}
            value={result.memory ?? ""}
            onChange={(e) => setResult({ ...result, memory: e.target.value })}
          />
        </label>
        <div className="editor-actions">
          <button type="button" className="primary" onClick={save} disabled={!result.name.trim()}>
            保存角色
          </button>
          <button type="button" className="secondary" onClick={() => setResult(null)} disabled={busy}>
            重新生成
          </button>
          <button type="button" className="secondary" onClick={onDone}>
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <h3 className="forge-title">✨ AI 捏角色</h3>
      <p className="forge-hint">填几个关键词（都可留空），AI 会生成名字、设定、开场白。</p>
      <div className="editor-row">
        <label className="field">
          <span className="field-label">性别</span>
          <input
            value={form.gender}
            placeholder="女 / 男 / 不限"
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">年龄段</span>
          <input
            value={form.age}
            placeholder="二十多岁 / 少年"
            onChange={(e) => setForm({ ...form, age: e.target.value })}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">性格</span>
        <input
          value={form.personality}
          placeholder="例如：温柔、话痨、傲娇、社恐"
          onChange={(e) => setForm({ ...form, personality: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">说话风格</span>
        <input
          value={form.speakingStyle}
          placeholder="例如：短句、爱用颜文字、毒舌但心软"
          onChange={(e) => setForm({ ...form, speakingStyle: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">和我的关系</span>
        <input
          value={form.relationship}
          placeholder="例如：青梅竹马、网友、同事"
          onChange={(e) => setForm({ ...form, relationship: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">补充设定</span>
        <textarea
          rows={3}
          value={form.notes}
          placeholder="背景故事、职业、爱好……"
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      {error && <p className="forge-error">{error}</p>}
      <div className="editor-actions">
        <button type="button" className="primary" onClick={() => void generate()} disabled={busy}>
          {busy ? "生成中…" : "开始捏人"}
        </button>
        <button type="button" className="secondary" onClick={onManual}>
          手动创建
        </button>
        <button type="button" className="secondary" onClick={onDone} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  );
}
