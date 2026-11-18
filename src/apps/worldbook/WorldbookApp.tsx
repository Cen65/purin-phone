import { useRef, useState } from "react";
import type { AppProps } from "../types";
import {
  useWorldbookStore,
} from "../../state/worldbookStore";
import { useCharactersStore } from "../../state/charactersStore";
import { useGroupsStore } from "../../state/groupsStore";
import {
  parseWorldbookJson,
  parseWorldbookText,
  worldbookToJson,
  collectWorldbookContext,
  type Worldbook,
  type WorldbookEntry,
  type WorldbookEntryMode,
  type WorldbookEntryPosition,
} from "../../core/worldbook";
import { downloadTextFile } from "../../core/download";
import { bus } from "../../core/events";
import { EmptyHint } from "../ui";

/**
 * 世界书 App（P3）：背景知识库。
 * 书 → 条目（常驻/关键词/正则 + 优先级 + 插入位置），绑定到角色或群。
 * 触发与注入逻辑在 core/worldbook.ts + ai/chatRunner.ts，本组件只做管理界面。
 */

const MODE_LABELS: Record<WorldbookEntryMode, string> = {
  always: "常驻",
  keyword: "关键词",
  regex: "正则",
};
const POSITION_LABELS: Record<WorldbookEntryPosition, string> = {
  system: "设定区",
  context: "近对话",
};

export default function WorldbookApp(_props: AppProps) {
  const [bookId, setBookId] = useState<string | null>(null);
  const books = useWorldbookStore((s) => s.books);
  const book = books.find((b) => b.id === bookId);
  if (book) return <BookEditor key={book.id} book={book} onBack={() => setBookId(null)} />;
  return <BookList onOpen={setBookId} />;
}

/* ---------------- 书列表 ---------------- */

function BookList({ onOpen }: { onOpen: (id: string) => void }) {
  const books = useWorldbookStore((s) => s.books);
  const characters = useCharactersStore((s) => s.characters);
  const groups = useGroupsStore((s) => s.groups);
  const { addBook, importBook } = useWorldbookStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  async function importFile(file: File) {
    try {
      const text = await file.text();
      const draft = file.name.endsWith(".json")
        ? parseWorldbookJson(text)
        : parseWorldbookText(text);
      const book = importBook({ ...draft, name: draft.name || file.name.replace(/\.[^.]+$/, "") });
      bus.emit("notify", { appId: "worldbook", title: "导入成功", body: `「${book.name}」${book.entries.length} 个条目` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bus.emit("notify", { kind: "error", title: "导入失败", body: message.slice(0, 80) });
    }
  }

  return (
    <div className="wb">
      <div className="contacts-actions">
        <button type="button" className="primary" onClick={() => onOpen(addBook("新世界书").id)}>
          ＋ 新建世界书
        </button>
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          导入（.json / .txt / .md）
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,.md,application/json,text/plain,text/markdown"
          className="hidden-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {books.length === 0 && <EmptyHint>还没有世界书。给角色挂一本，TA 就懂你的世界观设定。</EmptyHint>}
      <ul className="wb-list">
        {books.map((book) => {
          const boundCharacters = characters.filter((c) => c.worldbookIds?.includes(book.id));
          const boundGroups = groups.filter((g) => g.worldbookIds?.includes(book.id));
          return (
            <li key={book.id}>
              <button type="button" className="wb-row" onClick={() => onOpen(book.id)}>
                <span className="wb-row-icon">📖</span>
                <span className="wb-row-main">
                  <span className="wb-row-name">{book.name}</span>
                  <span className="wb-row-sub">
                    {book.entries.length} 个条目
                    {boundCharacters.length > 0 && ` · 绑定 ${boundCharacters.map((c) => c.name).join("、")}`}
                    {boundGroups.length > 0 && ` · 群 ${boundGroups.map((g) => g.name).join("、")}`}
                  </span>
                </span>
                <span className="wb-row-arrow">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- 书编辑 ---------------- */

function BookEditor({ book, onBack }: { book: Worldbook; onBack: () => void }) {
  const characters = useCharactersStore((s) => s.characters);
  const groups = useGroupsStore((s) => s.groups);
  const { updateBook, removeBook, addEntry, removeEntry, updateEntry } = useWorldbookStore.getState();
  const updateCharacter = useCharactersStore((s) => s.updateCharacter);
  const updateGroup = useGroupsStore((s) => s.updateGroup);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [testText, setTestText] = useState("");

  function toggleCharacterBinding(characterId: string) {
    const character = characters.find((c) => c.id === characterId);
    if (!character) return;
    const bound = character.worldbookIds?.includes(book.id) ?? false;
    updateCharacter(character.id, {
      worldbookIds: bound
        ? (character.worldbookIds ?? []).filter((id) => id !== book.id)
        : [...(character.worldbookIds ?? []), book.id],
    });
  }

  function toggleGroupBinding(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const bound = group.worldbookIds?.includes(book.id) ?? false;
    updateGroup(group.id, {
      worldbookIds: bound
        ? (group.worldbookIds ?? []).filter((id) => id !== book.id)
        : [...(group.worldbookIds ?? []), book.id],
    });
  }

  const triggered = collectWorldbookContext([book], testText);
  const triggeredTitles = [...triggered.system.matchAll(/【([^】]+)】/g), ...triggered.context.matchAll(/【([^】]+)】/g)].map(
    (match) => match[1],
  );

  const editingEntry = book.entries.find((entry) => entry.id === editingEntryId);

  return (
    <div className="editor">
      <div className="editor-row">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="返回世界书列表">
          ‹
        </button>
        <input
          className="wb-name-input"
          value={book.name}
          onChange={(e) => updateBook(book.id, { name: e.target.value })}
          aria-label="世界书名称"
        />
      </div>

      <label className="field">
        <span className="field-label">绑定角色（角色对话时自动注入）</span>
        <div className="group-composer-members">
          {characters.length === 0 && <span className="wb-hint">还没有角色</span>}
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              className={`chip ${character.worldbookIds?.includes(book.id) ? "chip-on" : ""}`}
              onClick={() => toggleCharacterBinding(character.id)}
            >
              {character.avatar} {character.name}
            </button>
          ))}
        </div>
      </label>
      {groups.length > 0 && (
        <label className="field">
          <span className="field-label">绑定群聊（与成员的书取并集）</span>
          <div className="group-composer-members">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`chip ${group.worldbookIds?.includes(book.id) ? "chip-on" : ""}`}
                onClick={() => toggleGroupBinding(group.id)}
              >
                👪 {group.name}
              </button>
            ))}
          </div>
        </label>
      )}

      <div className="wb-entries-head">
        <span className="field-label">条目（{book.entries.length}）</span>
        <span className="wb-entries-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              downloadTextFile(`${book.name}.世界书.json`, worldbookToJson(book), "application/json;charset=utf-8")
            }
          >
            导出 JSON
          </button>
          <button
            type="button"
            className="secondary"
            disabled={creatingEntry || Boolean(editingEntry)}
            onClick={() => {
              setCreatingEntry(true);
              setEditingEntryId(null);
            }}
          >
            ＋ 新增条目
          </button>
        </span>
      </div>

      {creatingEntry && (
        <EntryEditor
          initial={{ title: "", content: "", mode: "keyword", keys: [], pattern: "", priority: 0, enabled: true, position: "system" }}
          onCancel={() => setCreatingEntry(false)}
          onSave={(draft) => {
            addEntry(book.id, draft);
            setCreatingEntry(false);
          }}
        />
      )}
      {editingEntry && (
        <EntryEditor
          initial={editingEntry}
          onCancel={() => setEditingEntryId(null)}
          onSave={(draft) => {
            updateEntry(book.id, editingEntry.id, draft);
            setEditingEntryId(null);
          }}
        />
      )}

      {book.entries.length === 0 && !creatingEntry && <EmptyHint>还没有条目。常见用法：世界观名词（关键词触发）、时间地点背景（常驻）。</EmptyHint>}
      <ul className="wb-entry-list">
        {book.entries.map((entry) => (
          <li key={entry.id} className={`wb-entry ${entry.enabled ? "" : "wb-entry-off"}`}>
            <button type="button" className="wb-entry-main" onClick={() => setEditingEntryId(entry.id)}>
              <span className="wb-entry-title">
                {entry.title}
                <span className="wb-entry-tags">
                  {MODE_LABELS[entry.mode]}
                  {entry.mode !== "always" && entry.mode !== "regex" && entry.keys.length > 0 && `：${entry.keys.join("/")}`}
                  {entry.mode === "regex" && `：${entry.pattern}`}
                  {entry.position === "context" && ` · ${POSITION_LABELS.context}`}
                  {entry.priority !== 0 && ` · 优先级 ${entry.priority}`}
                </span>
              </span>
              <span className="wb-entry-preview">{entry.content.replace(/\n/g, " ").slice(0, 50) || "（空）"}</span>
            </button>
            <span className="contact-tools">
              <button
                type="button"
                className="icon-btn"
                title={entry.enabled ? "停用" : "启用"}
                onClick={() => updateEntry(book.id, entry.id, { enabled: !entry.enabled })}
              >
                {entry.enabled ? "⏸" : "▶️"}
              </button>
              <button
                type="button"
                className="icon-btn"
                title="删除条目"
                onClick={() => {
                  if (window.confirm(`删除条目「${entry.title}」？`)) removeEntry(book.id, entry.id);
                }}
              >
                🗑
              </button>
            </span>
          </li>
        ))}
      </ul>

      <label className="field">
        <span className="field-label">触发测试（粘贴一段对话，看哪些条目会命中）</span>
        <textarea
          rows={2}
          value={testText}
          placeholder="例如：我们明天去咖啡店见面吧"
          onChange={(e) => setTestText(e.target.value)}
        />
      </label>
      {testText.trim() && (
        <p className="wb-test-result">
          {triggeredTitles.length > 0 ? `命中：${triggeredTitles.join("、")}` : "没有条目命中"}
        </p>
      )}

      <div className="editor-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (!window.confirm(`删除世界书「${book.name}」？绑定会一并解除。`)) return;
            removeBook(book.id);
            onBack();
          }}
        >
          删除这本书
        </button>
      </div>
    </div>
  );
}

/* ---------------- 条目编辑 ---------------- */

type EntryDraft = Omit<WorldbookEntry, "id">;

function EntryEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: EntryDraft;
  onSave: (draft: EntryDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EntryDraft>({ ...initial, keys: [...initial.keys] });
  const [keysText, setKeysText] = useState(initial.keys.join(", "));

  const save = () => {
    if (!draft.title.trim() || !draft.content.trim()) return;
    onSave({
      ...draft,
      title: draft.title.trim(),
      keys: keysText.split(/[,，、]/).map((k) => k.trim()).filter(Boolean),
    });
  };

  return (
    <div className="wb-entry-editor">
      <div className="editor-row">
        <label className="field">
          <span className="field-label">条目名</span>
          <input
            value={draft.title}
            placeholder="例如：月光学院"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="field wb-priority">
          <span className="field-label">优先级</span>
          <input
            type="number"
            min={-100}
            max={100}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <div className="editor-row">
        <label className="field">
          <span className="field-label">触发方式</span>
          <select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as WorldbookEntryMode })}>
            <option value="keyword">关键词（最近对话提到才触发）</option>
            <option value="always">常驻（每次都注入）</option>
            <option value="regex">正则（灵活匹配）</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">插入位置</span>
          <select
            value={draft.position}
            onChange={(e) => setDraft({ ...draft, position: e.target.value as WorldbookEntryPosition })}
          >
            <option value="system">设定区（世界观类）</option>
            <option value="context">近对话（临时背景类）</option>
          </select>
        </label>
      </div>
      {draft.mode === "keyword" && (
        <label className="field">
          <span className="field-label">触发词（逗号分隔，任一命中即触发）</span>
          <input value={keysText} placeholder="学院, 上学, 课程" onChange={(e) => setKeysText(e.target.value)} />
        </label>
      )}
      {draft.mode === "regex" && (
        <label className="field">
          <span className="field-label">正则表达式（忽略大小写）</span>
          <input
            value={draft.pattern}
            placeholder="例如：(猫|布丁)"
            onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        <span className="field-label">内容（注入提示词的正文）</span>
        <textarea
          rows={4}
          value={draft.content}
          placeholder="这段背景知识会在触发时告诉角色……"
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
        />
      </label>
      <div className="editor-actions">
        <button type="button" className="primary" onClick={save} disabled={!draft.title.trim() || !draft.content.trim()}>
          保存条目
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
