import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AFFECTION_DEFAULT,
  affectionDelta,
  affectionStage,
  applyScoredState,
  buildAffectionScoreMessages,
  clampAffection,
  nextAffectionState,
  nextMood,
  applyAffectionFromMessage,
  parseAffectionScore,
  scoreAffectionRound,
} from "./affection";
import { registerProvider } from "./providers";
import type { LLMProvider } from "./types";
import { useCharactersStore } from "../state/charactersStore";
import { useSettingsStore } from "../state/settingsStore";

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

/* ---------- LLM 打分版 ---------- */

let replier = async () => '{"delta": 3, "mood": "雀跃", "reason": "被夸了"}';

const scorer: LLMProvider = {
  id: "fake-scorer",
  label: "打分桩",
  chat: async () => ({ content: await replier() }),
};
registerProvider(scorer);

const scoredCharacter = {
  id: "sc1",
  name: "小绿",
  avatar: "🌱",
  tagline: "",
  systemPrompt: "",
  affection: 60,
  createdAt: 0,
};

describe("buildAffectionScoreMessages / parseAffectionScore", () => {
  it("提示词含角色名、当前好感度与 JSON 输出要求", () => {
    const messages = buildAffectionScoreMessages(scoredCharacter, "小明", "你真棒", "嘿嘿");
    expect(messages[0]?.content).toContain("小绿");
    expect(messages[0]?.content).toContain("60/100");
    expect(messages[0]?.content).toContain("只输出 JSON");
    expect(messages[1]?.content).toContain("小明：你真棒");
    expect(messages[1]?.content).toContain("小绿（你）：嘿嘿");
  });

  it("解析正常输出与限幅；模型闲话包裹 JSON 也能切出来", () => {
    expect(parseAffectionScore('{"delta": 3, "mood": "雀跃"}')).toEqual({ delta: 3, mood: "雀跃" });
    expect(parseAffectionScore("打分如下：{\"delta\": 99, \"mood\": \"开心\"} 完毕")).toEqual({ delta: 6, mood: "开心" });
    expect(parseAffectionScore('{"delta": -30, "mood": ""}')).toEqual({ delta: -6, mood: "难过" });
    expect(parseAffectionScore("完全不是 JSON")).toBeNull();
    expect(parseAffectionScore('{"mood": "开心"}')).toBeNull();
  });

  it("applyScoredState 叠加并 clamp", () => {
    expect(applyScoredState(scoredCharacter, { delta: 3, mood: "雀跃" })).toEqual({ affection: 63, mood: "雀跃" });
    expect(applyScoredState(scoredCharacter, { delta: 99, mood: "开心" }).affection).toBe(100);
  });
});

describe("scoreAffectionRound 打分轮", () => {
  beforeEach(() => {
    replier = async () => '{"delta": 3, "mood": "雀跃", "reason": "被夸了"}';
    useCharactersStore.setState({ characters: [scoredCharacter] });
    useSettingsStore.setState({
      api: { provider: "fake-scorer", baseUrl: "x", apiKey: "x", model: "x" },
      persona: { nickname: "小明" },
      affectionLlm: true,
    });
  });

  it("开关开着：调模型并落库新状态", async () => {
    const state = await scoreAffectionRound("sc1", "你真棒", "嘿嘿");
    expect(state).toEqual({ affection: 63, mood: "雀跃" });
    expect(useCharactersStore.getState().characters[0]?.mood).toBe("雀跃");
  });

  it("开关关 / 未配置 API：直接返回 null 不调模型", async () => {
    useSettingsStore.setState({ affectionLlm: false });
    const chat = vi.spyOn(scorer, "chat");
    expect(await scoreAffectionRound("sc1", "你真棒", "嘿嘿")).toBeNull();
    useSettingsStore.setState({
      affectionLlm: true,
      api: { provider: "fake-scorer", baseUrl: "", apiKey: "", model: "" },
    });
    expect(await scoreAffectionRound("sc1", "你真棒", "嘿嘿")).toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it("模型输出解析失败 / 网络错误：静默返回 null，不改角色", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    replier = async () => "不是 JSON";
    expect(await scoreAffectionRound("sc1", "你真棒", "嘿嘿")).toBeNull();
    replier = async () => {
      throw new Error("炸了");
    };
    expect(await scoreAffectionRound("sc1", "你真棒", "嘿嘿")).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(useCharactersStore.getState().characters[0]?.affection).toBe(60);
  });
});
