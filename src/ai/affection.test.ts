import { describe, expect, it } from "vitest";
import {
  AFFECTION_DEFAULT,
  affectionDelta,
  affectionStage,
  clampAffection,
  nextAffectionState,
  nextMood,
  applyAffectionFromMessage,
} from "./affection";
import { useCharactersStore } from "../state/charactersStore";

describe("affectionDelta 关键词好感增减", () => {
  it("正向词每个 +2，单条封顶 +4", () => {
    expect(affectionDelta("谢谢你喜欢我")).toBe(4); // 命中 谢谢+喜欢 但封顶
    expect(affectionDelta("哈哈，好棒")).toBe(4);
    expect(affectionDelta("谢谢")).toBe(2);
  });

  it("负向词每个 -2，单条封顶 -4", () => {
    expect(affectionDelta("讨厌，好烦")).toBe(-4);
    expect(affectionDelta("呵呵")).toBe(-2);
  });

  it("中性消息为 0", () => {
    expect(affectionDelta("今天中午吃什么")).toBe(0);
    expect(affectionDelta("")).toBe(0);
  });
});

describe("clamp 与阶段", () => {
  it("clamp 到 0~100", () => {
    expect(clampAffection(-5)).toBe(0);
    expect(clampAffection(120)).toBe(100);
    expect(clampAffection(62.4)).toBe(62);
  });

  it("阶段划分", () => {
    expect(affectionStage(90)).toBe("亲密无间");
    expect(affectionStage(70)).toBe("亲近");
    expect(affectionStage(50)).toBe("熟悉");
    expect(affectionStage(25)).toBe("一般");
    expect(affectionStage(5)).toBe("疏远");
  });
});

describe("nextMood 心情推导", () => {
  it("正→开心；小负→有点低落；重挫→难过", () => {
    expect(nextMood(2)).toBe("开心");
    expect(nextMood(-2)).toBe("有点低落");
    expect(nextMood(-4)).toBe("难过");
  });

  it("无变化沿用旧心情，没有则平静", () => {
    expect(nextMood(0, "开心")).toBe("开心");
    expect(nextMood(0)).toBe("平静");
    expect(nextMood(0, "")).toBe("平静");
  });
});

describe("nextAffectionState 组合", () => {
  it("未初始化从默认 50 起步", () => {
    expect(nextAffectionState("想你")).toEqual({ affection: 52, mood: "开心" });
  });

  it("累计并 clamp", () => {
    const first = nextAffectionState("讨厌", { affection: 98 });
    expect(first).toEqual({ affection: 96, mood: "有点低落" });
    const second = nextAffectionState("爱你抱抱", first);
    expect(second.affection).toBe(100);
  });

  it("从 0 再扣也到不了负数", () => {
    expect(nextAffectionState("滚蛋闭嘴", { affection: 3 }).affection).toBe(0);
  });
});

describe("applyAffectionFromMessage 落库钩子", () => {
  it("更新角色的 affection/mood；角色不存在返回 null", () => {
    useCharactersStore.setState({
      characters: [
        { id: "c1", name: "小绿", avatar: "🌱", tagline: "", systemPrompt: "", createdAt: 0 },
      ],
    });
    const state = applyAffectionFromMessage("c1", "谢谢你陪我聊天");
    expect(state).toEqual({ affection: 52, mood: "开心" });
    const updated = useCharactersStore.getState().characters[0];
    expect(updated?.affection).toBe(52);
    expect(updated?.mood).toBe("开心");
    expect(applyAffectionFromMessage("missing", "喜欢你")).toBeNull();
    expect(AFFECTION_DEFAULT).toBe(50);
  });
});
