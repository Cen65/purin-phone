import { beforeEach, describe, expect, it } from "vitest";
import { useMomentsStore, relativeTime } from "./momentsStore";

/** 朋友圈（P2）：话题解析、点赞、评论、时间文案。 */
describe("momentsStore", () => {
  beforeEach(() => {
    useMomentsStore.setState({ moments: [] });
  });

  it("addMoment 解析 #话题 最多 5 个", () => {
    const moment = useMomentsStore.getState().addMoment({
      authorId: "me",
      authorName: "我",
      authorAvatar: "🙂",
      text: "今天很开心 #开森 #猫猫 #周末 #咖啡 #旅行 #多余的",
    });
    expect(moment.tags).toEqual(["开森", "猫猫", "周末", "咖啡", "旅行"]);
  });

  it("toggleLike 同一用户点赞再点取消", () => {
    const store = useMomentsStore.getState();
    const moment = store.addMoment({ authorId: "me", authorName: "我", authorAvatar: "🙂", text: "hi" });
    useMomentsStore.getState().toggleLike(moment.id, "me");
    expect(useMomentsStore.getState().moments[0]?.likes).toEqual(["me"]);
    useMomentsStore.getState().toggleLike(moment.id, "me");
    expect(useMomentsStore.getState().moments[0]?.likes).toEqual([]);
  });

  it("addComment 追加评论保持顺序", () => {
    const store = useMomentsStore.getState();
    const moment = store.addMoment({ authorId: "me", authorName: "我", authorAvatar: "🙂", text: "hi" });
    useMomentsStore.getState().addComment(moment.id, "阿茶", "沙发");
    useMomentsStore.getState().addComment(moment.id, "小绿", "板凳");
    const comments = useMomentsStore.getState().moments[0]?.comments ?? [];
    expect(comments.map((comment) => comment.authorName)).toEqual(["阿茶", "小绿"]);
  });

  it("relativeTime 刚刚/分钟", () => {
    const now = Date.now();
    expect(relativeTime(now, now)).toBe("刚刚");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
  });
});
