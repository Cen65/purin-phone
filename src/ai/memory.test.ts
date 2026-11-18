import { describe, it, expect } from "vitest";
import { buildMemoryMessages, capMemory, MEMORY_LIMIT } from "./memory";
import type { Character } from "../types";
import type { ChatMessage } from "../state/chatStore";

const character: Character = {
  id: "c1",
  name: "小绿",
  avatar: "🌱",
  tagline: "",
  systemPrompt: "",
  memory: "- 用户喜欢猫",
  createdAt: 0,
};

function message(role: "user" | "assistant", content: string): ChatMessage {
  return { id: `${role}-${content}`, role, content, createdAt: 0, status: "done" };
}

describe("buildMemoryMessages", () => {
  it("现有记忆 + 最近对话进入 prompt，用户昵称参与转写", () => {
    const messages = buildMemoryMessages({
      character,
      persona: { nickname: "阿明" },
      history: [message("user", "我养了只猫"), message("assistant", "真的吗")],
    });
    expect(messages).toHaveLength(2);
    const user = messages[1].content;
    expect(user).toContain("- 用户喜欢猫");
    expect(user).toContain("阿明：我养了只猫");
    expect(user).toContain("小绿：真的吗");
  });

  it("记忆为空时显示（空）占位", () => {
    const user = buildMemoryMessages({
      character: { ...character, memory: "" },
      persona: { nickname: "" },
      history: [],
    })[1].content;
    expect(user).toContain("（空）");
    expect(user).toContain("角色名：小绿");
  });
});

describe("capMemory", () => {
  it("超长按行截断、不超长原样", () => {
    const short = capMemory("- a\n- b", 100);
    expect(short).toBe("- a\n- b");

    const long = Array.from({ length: 100 }, (_, i) => `- 记忆条目第${i}号`).join("\n");
    const capped = capMemory(long, MEMORY_LIMIT);
    expect(capped.length).toBeLessThanOrEqual(MEMORY_LIMIT);
    expect(capped.endsWith("号")).toBe(true); // 保留完整行
  });

  it("单行超长的兜底硬切", () => {
    const single = "x".repeat(3000);
    expect(capMemory(single).length).toBe(MEMORY_LIMIT);
  });
});
