import { useRef, useState } from "react";
import type { AppProps } from "../types";
import { useCharactersStore, type CharacterDraft, toCard, parseCard } from "../../state/charactersStore";
import { useChatStore } from "../../state/chatStore";
import { useCallStore } from "../../state/callStore";
import { usePhoneStore } from "../../state/phoneStore";
import { downloadTextFile } from "../../core/download";
import { bus } from "../../core/events";
import { EmptyHint } from "../ui";

/**
 * 联系人 App：角色（Character）的增删改查 + 角色卡导入导出 + 拨打电话。
 * 点名字进聊天；📞 发起模拟来电（CallHost 接管界面）。
 */
export default function ContactsApp(_props: AppProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
  return <ContactList onEdit={(id) => setEditingId(id)} onCreate={() => setCreating(true)} />;
}

function ContactList({
  onEdit,
  onCreate,
}: {
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const characters = useCharactersStore((s) => s.characters);
  const addCharacter = useCharactersStore((s) => s.addCharacter);
  const openApp = usePhoneStore((s) => s.openApp);
  const startIncoming = useCallStore((s) => s.startIncoming);
  const fileRef = useRef<HTMLInputElement>(null);

  async function importCard(file: File) {
    try {
      const draft = parseCard(await file.text());
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
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          导入角色卡
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
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
  });

  const save = () => {
    if (!draft.name.trim()) return;
    const cleaned: CharacterDraft = {
      ...draft,
      memory: draft.memory?.trim() || undefined,
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
        <span className="field-label">长期记忆（会和设定一起注入提示词，手动维护）</span>
        <textarea
          rows={4}
          value={draft.memory ?? ""}
          placeholder={"你们之间发生过的事……\n例如：用户喜欢在深夜找我聊天；上个月一起养了猫。"}
          onChange={(event) => setDraft({ ...draft, memory: event.target.value })}
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
