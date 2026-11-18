import { describe, it, expect, beforeEach } from "vitest";
import { useWorldbookStore } from "./worldbookStore";
import { useCharactersStore } from "./charactersStore";
import { useGroupsStore } from "./groupsStore";

describe("worldbookStore", () => {
  beforeEach(() => {
    useWorldbookStore.setState({ books: [] });
    useCharactersStore.setState({ characters: [] });
    useGroupsStore.setState({ groups: [] });
  });

  it("addBook / addEntry / updateEntry / removeEntry 基本流", () => {
    const book = useWorldbookStore.getState().addBook("  设定集  ");
    expect(book.name).toBe("设定集");
    expect(useWorldbookStore.getState().books).toHaveLength(1);

    const entry = useWorldbookStore.getState().addEntry(book.id, {
      title: "世界观",
      content: "c",
      mode: "always",
      keys: [],
      pattern: "",
      priority: 0,
      enabled: true,
      position: "system",
    });
    if (!entry) throw new Error("addEntry 不应返回 null");
    expect(entry.id).toBeTruthy();

    useWorldbookStore.getState().updateEntry(book.id, entry.id, { priority: 9, content: "改" });
    const stored = useWorldbookStore.getState().books[0].entries[0];
    expect(stored).toMatchObject({ priority: 9, content: "改" });

    useWorldbookStore.getState().removeEntry(book.id, entry.id);
    expect(useWorldbookStore.getState().books[0].entries).toHaveLength(0);
  });

  it("importBook 生成条目 id；updateBook 改名", () => {
    const book = useWorldbookStore.getState().importBook({
      name: "导入书",
      entries: [
        { title: "a", content: "x", mode: "keyword", keys: ["k"], pattern: "", priority: 0, enabled: true, position: "system" },
      ],
    });
    expect(book.entries[0].id).not.toBe(book.id);
    useWorldbookStore.getState().updateBook(book.id, { name: "新名字" });
    expect(useWorldbookStore.getState().books[0].name).toBe("新名字");
  });

  it("removeBook 反向清理角色与群上的绑定引用", () => {
    const book = useWorldbookStore.getState().addBook("共享书");
    const keep = useWorldbookStore.getState().addBook("留下的书");

    useCharactersStore.setState({
      characters: [
        { id: "c1", name: "小绿", avatar: "🌱", tagline: "", systemPrompt: "", createdAt: 0, worldbookIds: [book.id, keep.id] },
      ],
    });
    useGroupsStore.setState({
      groups: [{ id: "g1", name: "群", memberIds: ["c1"], createdAt: 0, worldbookIds: [book.id] }],
    });

    useWorldbookStore.getState().removeBook(book.id);

    expect(useWorldbookStore.getState().books.map((b) => b.id)).toEqual([keep.id]);
    expect(useCharactersStore.getState().characters[0].worldbookIds).toEqual([keep.id]);
    expect(useGroupsStore.getState().groups[0].worldbookIds).toEqual([]);
  });
});
