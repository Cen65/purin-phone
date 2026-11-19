import { useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../../core/storage";
import { uid } from "../../core/id";
import { useCharactersStore } from "../../state/charactersStore";
import type { AppProps } from "../types";

/** 纪念日 App：记录「在一起」这类开始的日子，看第 N 天、下一个周年还有多远。 */

export interface AnniversaryItem {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  characterId?: string;
}

interface AnniversaryState {
  items: AnniversaryItem[];
  addItem: (item: Omit<AnniversaryItem, "id">) => void;
  removeItem: (id: string) => void;
}

export const useAnniversaryStore = create<AnniversaryState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({ items: [...state.items, { ...item, id: uid() }] })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((x) => x.id !== id) })),
    }),
    { name: "purin.app.anniversary", version: 1, storage: createJSONStorage(() => safeLocalStorage) },
  ),
);

const DAY_MS = 24 * 60 * 60 * 1000;

/** 从 date 到 now（含当天）经过了几天：同日=第 1 天 */
export function daysSince(date: string, now: number): number {
  const start = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(start)) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start) / DAY_MS) + 1;
}

/** 下一个周年（date 在今年/明年的年度重复日）还有几天：当天=0 */
export function daysToNextAnniversary(date: string, now: number): number {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate());
  }
  return Math.round((next.getTime() - today.getTime()) / DAY_MS);
}

export default function AnniversaryApp(_props: AppProps) {
  const items = useAnniversaryStore((s) => s.items);
  const characters = useCharactersStore((s) => s.characters);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [characterId, setCharacterId] = useState("");

  const add = () => {
    const t = title.trim();
    if (!t || !date) return;
    useAnniversaryStore.getState().addItem({
      title: t,
      date,
      characterId: characterId || undefined,
    });
    setTitle("");
    setDate("");
    setCharacterId("");
  };

  const nameOf = (id?: string) => characters.find((c) => c.id === id)?.name;

  return (
    <div className="anniv">
      <div className="anniv-list">
        {items.length === 0 && <div className="anniv-empty">还没有纪念日。加一个开始的日子吧。</div>}
        {items.map((item) => {
          const days = daysSince(item.date, Date.now());
          const next = daysToNextAnniversary(item.date, Date.now());
          return (
            <div key={item.id} className="anniv-card">
              <div className="anniv-card-head">
                <span className="anniv-title">{item.title}</span>
                <button
                  type="button"
                  className="icon-btn ghost"
                  onClick={() => useAnniversaryStore.getState().removeItem(item.id)}
                  aria-label="删除"
                >
                  ✕
                </button>
              </div>
              <div className="anniv-days">
                第 <b>{days}</b> 天
                {nameOf(item.characterId) && <span className="anniv-with"> · 和{nameOf(item.characterId)}</span>}
              </div>
              <div className="anniv-next">
                {item.date} · 下一个周年还有 {next} 天
              </div>
            </div>
          );
        })}
      </div>

      <div className="anniv-composer">
        <div className="field">
          <label>名称</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="在一起" maxLength={24} />
        </div>
        <div className="field">
          <label>开始日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>和谁（可选）</label>
          <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">—</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="primary" onClick={add} disabled={!title.trim() || !date}>
          记住这一天
        </button>
      </div>
    </div>
  );
}
