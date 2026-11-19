import { describe, expect, it } from "vitest";
import { pickSpeakers } from "./groupStrategy";
import type { Character } from "../types";

function member(id: string, styleLength?: Character["styleLength"]): Character {
  return {
    id,
    name: id,
    avatar: "🙂",
    tagline: "",
    systemPrompt: "",
    createdAt: 0,
    ...(styleLength ? { styleLength } : {}),
  };
}

describe("pickSpeakers 抢答策略", () => {
  it("all（含 undefined）按加入顺序全员发言", () => {
    const members = [member("a"), member("b"), member("c")];
    expect(pickSpeakers(members, "all", Math.random).map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(pickSpeakers(members, undefined, Math.random).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("空成员返回空数组", () => {
    expect(pickSpeakers([], "all")).toEqual([]);
    expect(pickSpeakers([], "random")).toEqual([]);
  });

  it("random：rand 返回 0.9 时单人（无第二人）、返回 0.1 时两人", () => {
    const members = [member("a"), member("b"), member("c")];
    const lone = pickSpeakers(members, "random", () => 0.9);
    expect(lone).toHaveLength(1);
    const duo = pickSpeakers(members, "random", () => 0.1);
    expect(duo).toHaveLength(2);
    // 不重复
    expect(new Set(duo.map((m) => m.id)).size).toBe(2);
  });

  it("单人群 random 不受第二人概率影响，仍是 1 人", () => {
    const lone = pickSpeakers([member("a")], "random", () => 0.1);
    expect(lone.map((m) => m.id)).toEqual(["a"]);
  });

  it("weighted：rand=0.99 落在权重最大一侧，话痨（long=5/8）被选中", () => {
    const members = [
      member("quiet", "short"), // 1
      member("normal", "medium"), // 3
      member("chatty", "long"), // 5
    ];
    // rand()<0.35 为 false → 单人；r = 0.99 * 9 = 8.91，落在 chatty 段（1+3 之后）
    const picked = pickSpeakers(members, "weighted", () => 0.99);
    expect(picked.map((m) => m.id)).toEqual(["chatty"]);
  });

  it("weighted：rand=0（首个被抽中）且触发第二人时，两次都从头抽", () => {
    const members = [member("a", "short"), member("b", "medium")];
    // rand()=0：wantSecond true（0<0.35）→ 两人；两次加权抽样都抽中 index 0
    const picked = pickSpeakers(members, "weighted", () => 0);
    expect(picked.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("random 模式所有人权重相同：rand=0.99 时抽中最后一人", () => {
    const members = [member("a"), member("b"), member("c")];
    // rand()=0.9 不触发第二人；r = 0.99 * 3 = 2.97 → index 2
    const picked = pickSpeakers(members, "random", () => 0.99);
    expect(picked.map((m) => m.id)).toEqual(["c"]);
  });
});
