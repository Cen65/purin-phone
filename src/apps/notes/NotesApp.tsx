import { useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../../core/storage";
import { uid } from "../../core/id";
import type { AppProps } from "../types";
import { EmptyHint } from "../ui";
import type { Note as NoteModel } from "../../types";

/**
 * 便签 App：演示“最薄”的一个 App 长什么样。
 * 它自带一个局部持久化 store，不依赖 AI、不依赖其他 App ——
 * 复制这个文件改一改，就是你的下一个新 App。
 */
interface NotesState {
  notes: NoteModel[];
  upsertNote: (note: Partial<NoteModel> & Pick<NoteModel, "title" | "body">) => void;
  removeNote: (id: string) => void;
}

const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],
      upsertNote: (input) =>
        set((state) => {
          if (input.id) {
            return {
              notes: state.notes.map((note) =>
                note.id === input.id ? { ...note, ...input, updatedAt: Date.now() } : note,
              ),
            };
          }
          const note: NoteModel = { id: uid(), title: input.title, body: input.body, updatedAt: Date.now() };
          return { notes: [note, ...state.notes] };
        }),
      removeNote: (id) => set((state) => ({ notes: state.notes.filter((note) => note.id !== id) })),
    }),
    {
      name: "purin.notes",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

export default function NotesApp(_props: AppProps) {
  const notes = useNotesStore((s) => s.notes);
  const [editing, setEditing] = useState<NoteModel | "new" | null>(null);

  if (editing) {
    const isNew = editing === "new";
    return (
      <NoteEditor
        initial={isNew ? null : (editing as NoteModel)}
        onSave={(title, body) => {
          useNotesStore.getState().upsertNote(isNew ? { title, body } : { ...(editing as NoteModel), title, body });
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="notes">
      <div className="contacts-actions">
        <button type="button" className="primary" onClick={() => setEditing("new")}>
          ＋ 新便签
        </button>
      </div>
      {notes.length === 0 && <EmptyHint>还没有便签，写一条试试</EmptyHint>}
      <ul className="note-list">
        {notes.map((note) => (
          <li key={note.id} className="note-card">
            <button type="button" className="note-main" onClick={() => setEditing(note)}>
              <span className="note-title">{note.title || "（无标题）"}</span>
              <span className="note-body">{note.body.slice(0, 80)}</span>
              <span className="note-time">{new Date(note.updatedAt).toLocaleString("zh-CN")}</span>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="删除便签"
              onClick={() => useNotesStore.getState().removeNote(note.id)}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: NoteModel | null;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  return (
    <div className="editor">
      <label className="field">
        <span className="field-label">标题</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题" />
      </label>
      <label className="field">
        <span className="field-label">内容</span>
        <textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} placeholder="写点什么…" />
      </label>
      <div className="editor-actions">
        <button type="button" className="primary" onClick={() => onSave(title.trim(), body.trim())}>
          保存
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
