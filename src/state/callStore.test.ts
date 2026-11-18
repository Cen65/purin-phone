import { beforeEach, describe, expect, it } from "vitest";
import { useCallStore } from "./callStore";
import { useCharactersStore } from "./charactersStore";
import { useChatStore } from "./chatStore";
import type { Character } from "../types";

const character: Character = {
  id: "c1",
  name: "小绿",
  avatar: "🌱",
  tagline: "",
  systemPrompt: "",
  createdAt: 0,
};

/** 模拟来电（P2）：状态机 + 挂断转写进普通聊天。 */
describe("callStore", () => {
  beforeEach(() => {
    useCharactersStore.setState({ characters: [character] });
    useChatStore.setState({ messages: {}, generating: {} });
    useCallStore.setState({ phase: "idle", characterId: null, lines: [], startedAt: null, endedReason: "" });
  });

  it("完整通话：incoming → active → 挂断后转写进普通聊天", () => {
    const store = useCallStore.getState();
    store.startIncoming("c1");
    expect(useCallStore.getState().phase).toBe("incoming");
    useCallStore.getState().accept();
    expect(useCallStore.getState().phase).toBe("active");
    useCallStore.getState().pushLine("user", "喂？");
    useCallStore.getState().pushLine("assistant", "喂，是我");
    useCallStore.getState().hangup();
    const phase = useCallStore.getState().phase;
    expect(phase).toBe("ended");
    expect(useCallStore.getState().endedReason).toContain("小绿");
    const transcript = useChatStore.getState().messages["c1"] ?? [];
    expect(transcript.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(transcript.every((message) => message.status === "done")).toBe(true);
    useCallStore.getState().reset();
    expect(useCallStore.getState().phase).toBe("idle");
  });

  it("拒接：直接回 idle 且不写聊天记录", () => {
    useCallStore.getState().startIncoming("c1");
    useCallStore.getState().decline();
    expect(useCallStore.getState().phase).toBe("idle");
    expect(useCallStore.getState().lines).toHaveLength(0);
    expect(useChatStore.getState().messages["c1"]).toBeUndefined();
  });
});
