import { describe, expect, it } from "vitest";
import { toCard, parseCard } from "./charactersStore";
import type { Character } from "../types";

const character: Character = {
  id: "c1",
  name: "阿茶",
  avatar: "🍵",
  tagline: "猫咖店主",
  systemPrompt: "温柔",
  memory: "  用户养了猫  ",
  createdAt: 0,
};

/** 角色卡导入导出（P1）：type + version 识别的小而稳的交换格式。 */
describe("角色卡", () => {
  it("toCard 导出并裁剪空白 memory", () => {
    const card = toCard(character);
    expect(card).toEqual({
      type: "purin.character",
      version: 1,
      name: "阿茶",
      avatar: "🍵",
      tagline: "猫咖店主",
      systemPrompt: "温柔",
      memory: "用户养了猫",
    });
  });

  it("无 memory 时导出不含 memory 字段", () => {
    const { memory: _memory, ...rest } = character;
    expect(toCard(rest).memory).toBeUndefined();
  });

  it("parseCard 往返：导出的卡能再导入", () => {
    const draft = parseCard(JSON.stringify(toCard(character)));
    expect(draft.name).toBe("阿茶");
    expect(draft.systemPrompt).toBe("温柔");
    expect(draft.memory).toBe("用户养了猫");
  });

  it("parseCard 兼容旧标识 my-phone.character（更名前导出的卡）", () => {
    const draft = parseCard(
      JSON.stringify({
        type: "my-phone.character",
        version: 1,
        name: "旧卡",
        avatar: "🙂",
        tagline: "旧格式",
        systemPrompt: "旧版导出",
      }),
    );
    expect(draft.name).toBe("旧卡");
    expect(draft.systemPrompt).toBe("旧版导出");
  });

  it("parseCard 对非法输入抛「角色卡格式不正确」", () => {
    expect(() => parseCard("不是json")).toThrow("角色卡格式不正确");
    expect(() => parseCard("{}")).toThrow("角色卡格式不正确");
    expect(() => parseCard(JSON.stringify({ type: "other.card", version: 1, name: "x", avatar: "🙂", tagline: "", systemPrompt: "" }))).toThrow(
      "角色卡格式不正确",
    );
  });
});
