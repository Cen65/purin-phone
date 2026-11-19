import type { Character } from "../types";
import type { GroupReplyMode } from "../state/groupsStore";

/**
 * 群聊抢答策略（纯函数，便于测试）：
 * - all      全员按加入顺序发言（默认，行为与旧版一致）
 * - random   每轮随机 1~2 人抢话（人数 >1 时 35% 概率出现第二人）
 * - weighted 按「话多程度」加权抢答：话少=1 / 适中=3 / 话多=5，
 *            复用角色的说话风格（styleLength）作为性格权重——话痨更容易抢到。
 */
const SECOND_SPEAKER_PROB = 0.35;

const WEIGHT: Record<NonNullable<Character["styleLength"]>, number> = {
  short: 1,
  medium: 3,
  long: 5,
};

export function pickSpeakers(
  members: Character[],
  mode: GroupReplyMode | undefined,
  rand: () => number = Math.random,
): Character[] {
  if (members.length === 0) return [];
  if (mode !== "random" && mode !== "weighted") return [...members];

  const wantSecond = members.length > 1 && rand() < SECOND_SPEAKER_PROB;
  const count = wantSecond ? 2 : 1;

  const pool = [...members];
  const picked: Character[] = [];
  for (let round = 0; round < count && pool.length > 0; round++) {
    const weights = pool.map((member) =>
      mode === "weighted" ? WEIGHT[member.styleLength ?? "short"] : 1,
    );
    let r = rand() * weights.reduce((sum, weight) => sum + weight, 0);
    let index = 0;
    while (index < pool.length - 1 && r >= weights[index]) {
      r -= weights[index];
      index += 1;
    }
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}
