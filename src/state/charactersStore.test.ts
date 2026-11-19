import { describe, expect, it } from "vitest";
import { toCard, parseCard, parseCharacterText } from "./charactersStore";
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

  it("说话风格字段（v1.2）随卡往返；非法 styleLength 被忽略", () => {
    const styled: Character = {
      ...character,
      styleLength: "long",
      styleEmoticon: true,
      styleAction: true,
    };
    const draft = parseCard(JSON.stringify(toCard(styled)));
    expect(draft.styleLength).toBe("long");
    expect(draft.styleEmoticon).toBe(true);
    expect(draft.styleAction).toBe(true);
    const bad = parseCard(
      JSON.stringify({ ...toCard(character), styleLength: "巨话痨" }),
    );
    expect(bad.styleLength).toBeUndefined();
  });

  it("印象档案（v1.3）随卡往返；无印象不带字段", () => {
    const withImpression: Character = { ...character, impression: "- TA 嘴硬心软" };
    const draft = parseCard(JSON.stringify(toCard(withImpression)));
    expect(draft.impression).toBe("- TA 嘴硬心软");
    const plain = parseCard(JSON.stringify(toCard(character)));
    expect(plain.impression).toBeUndefined();
    expect(JSON.stringify(toCard(character))).not.toContain("impression");
  });

  it("parseCard 对非法输入抛「角色卡格式不正确」", () => {
    expect(() => parseCard("不是json")).toThrow("角色卡格式不正确");
    expect(() => parseCard("{}")).toThrow("角色卡格式不正确");
    expect(() => parseCard(JSON.stringify({ type: "other.card", version: 1, name: "x", avatar: "🙂", tagline: "", systemPrompt: "" }))).toThrow(
      "角色卡格式不正确",
    );
  });

  it("v1.1 新字段 firstMessage / exampleDialogue 随卡往返（缺省时省略）", () => {
    const card = toCard({ ...character, firstMessage: "你来啦", exampleDialogue: "用户：在吗\n阿茶：嗯" });
    expect(card.firstMessage).toBe("你来啦");
    const draft = parseCard(JSON.stringify(card));
    expect(draft.firstMessage).toBe("你来啦");
    expect(draft.exampleDialogue).toBe("用户：在吗\n阿茶：嗯");
    // 无新字段的旧卡（v1）导入不带这两项
    const legacy = parseCard(
      JSON.stringify({ type: "purin.character", version: 1, name: "旧", avatar: "🙂", tagline: "", systemPrompt: "" }),
    );
    expect(legacy.firstMessage).toBeUndefined();
    expect(legacy.exampleDialogue).toBeUndefined();
  });
});

describe("parseCharacterText 纯文本导入（P3）", () => {
  it("首行为名字 + 字段行解析 + 续行并入 + 未知行进设定", () => {
    const draft = parseCharacterText(
      ["# 布丁", "头像：🍮", "简介：甜品的化身", "设定：外冷内热。", "其实很粘人。", "怪脾气：别提。", "开场白：你来啦？"].join("\n"),
    );
    expect(draft.name).toBe("布丁");
    expect(draft.avatar).toBe("🍮");
    expect(draft.tagline).toBe("甜品的化身");
    expect(draft.systemPrompt).toBe("外冷内热。\n其实很粘人。\n怪脾气：别提。");
    expect(draft.firstMessage).toBe("你来啦？");
  });

  it("「名字：xxx」式首行与「对话示例」字段", () => {
    const draft = parseCharacterText(
      ["名字：小绿", "对话示例：用户：hi", "小绿：hello"].join("\n"),
    );
    expect(draft.name).toBe("小绿");
    expect(draft.exampleDialogue).toBe("用户：hi\n小绿：hello");
  });

  it("全空文本回退「未命名角色」+ 默认头像", () => {
    const draft = parseCharacterText("");
    expect(draft.name).toBe("未命名角色");
    expect(draft.avatar).toBe("🙂");
  });
});
