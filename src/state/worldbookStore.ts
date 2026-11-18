import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";
import { uid } from "../core/id";
import type { Worldbook, WorldbookEntry, WorldbookDraft } from "../core/worldbook";
import { useCharactersStore } from "./charactersStore";
import { useGroupsStore } from "./groupsStore";

/**
 * 世界书存取（P3）：书籍的增删改 + 条目级编辑 + 导入。
 * 绑定关系存在角色/群上（Character.worldbookIds / Group.worldbookIds），
 * 删书时在这里反向清理所有引用。
 */

interface WorldbookState {
  books: Worldbook[];
  addBook: (name: string) => Worldbook;
  updateBook: (id: string, patch: Partial<Pick<Worldbook, "name" | "description">>) => void;
  removeBook: (id: string) => void;
  addEntry: (bookId: string, draft: Omit<WorldbookEntry, "id">) => WorldbookEntry | null;
  updateEntry: (bookId: string, entryId: string, patch: Partial<Omit<WorldbookEntry, "id">>) => void;
  removeEntry: (bookId: string, entryId: string) => void;
  importBook: (draft: WorldbookDraft) => Worldbook;
}

function mapBook(books: Worldbook[], bookId: string, fn: (book: Worldbook) => Worldbook): Worldbook[] {
  return books.map((book) => (book.id === bookId ? fn(book) : book));
}

export const useWorldbookStore = create<WorldbookState>()(
  persist(
    (set) => ({
      books: [],
      addBook: (name) => {
        const book: Worldbook = {
          id: uid(),
          name: name.trim() || "新世界书",
          entries: [],
          createdAt: Date.now(),
        };
        set((state) => ({ books: [...state.books, book] }));
        return book;
      },
      updateBook: (id, patch) =>
        set((state) => ({ books: mapBook(state.books, id, (book) => ({ ...book, ...patch })) })),
      removeBook: (id) => {
        set((state) => ({ books: state.books.filter((book) => book.id !== id) }));
        // 反向清理角色与群上的绑定引用
        const characters = useCharactersStore.getState();
        for (const character of characters.characters) {
          if (character.worldbookIds?.includes(id)) {
            characters.updateCharacter(character.id, {
              worldbookIds: character.worldbookIds.filter((bookId) => bookId !== id),
            });
          }
        }
        const groups = useGroupsStore.getState();
        for (const group of groups.groups) {
          if (group.worldbookIds?.includes(id)) {
            groups.updateGroup(group.id, {
              worldbookIds: group.worldbookIds.filter((bookId) => bookId !== id),
            });
          }
        }
      },
      addEntry: (bookId, draft) => {
        const entry: WorldbookEntry = { ...draft, id: uid() };
        set((state) => ({
          books: mapBook(state.books, bookId, (book) => ({ ...book, entries: [...book.entries, entry] })),
        }));
        return entry;
      },
      updateEntry: (bookId, entryId, patch) =>
        set((state) => ({
          books: mapBook(state.books, bookId, (book) => ({
            ...book,
            entries: book.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
          })),
        })),
      removeEntry: (bookId, entryId) =>
        set((state) => ({
          books: mapBook(state.books, bookId, (book) => ({
            ...book,
            entries: book.entries.filter((entry) => entry.id !== entryId),
          })),
        })),
      importBook: (draft) => {
        const book: Worldbook = {
          id: uid(),
          name: draft.name.trim() || "导入的世界书",
          ...(draft.description ? { description: draft.description } : {}),
          entries: draft.entries.map((entry) => ({ ...entry, id: uid() })),
          createdAt: Date.now(),
        };
        set((state) => ({ books: [...state.books, book] }));
        return book;
      },
    }),
    {
      name: "purin.worldbooks",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
