import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";
import { uid } from "../core/id";

/**
 * 朋友圈（P2）：角色和"我"都能发动态，可点赞、评论。
 * 作者信息（名字/头像）在发布时快照进 Moment——角色被删后老动态仍可读。
 * 角色自动发动态的生成逻辑见 src/ai/creative.ts。
 */

export interface MomentComment {
  id: string;
  authorName: string;
  content: string;
  at: number;
}

export interface Moment {
  id: string;
  /** "me" 或角色 id */
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  /** 从正文里解析出的 #话题 */
  tags: string[];
  /** 点赞者 id（"me" 或角色 id） */
  likes: string[];
  comments: MomentComment[];
  createdAt: number;
}

export interface MomentDraft {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
}

const MAX_MOMENTS = 200;

function parseTags(text: string): string[] {
  return [...text.matchAll(/#([^\s#]{1,24})/g)].map((match) => match[1]!).slice(0, 5);
}

interface MomentsState {
  moments: Moment[];
  addMoment: (draft: MomentDraft) => Moment;
  removeMoment: (id: string) => void;
  toggleLike: (id: string, who: string) => void;
  addComment: (id: string, authorName: string, content: string) => void;
}

export const useMomentsStore = create<MomentsState>()(
  persist(
    (set) => ({
      moments: [],
      addMoment: (draft) => {
        const moment: Moment = {
          id: uid(),
          authorId: draft.authorId,
          authorName: draft.authorName,
          authorAvatar: draft.authorAvatar,
          text: draft.text.trim(),
          tags: parseTags(draft.text),
          likes: [],
          comments: [],
          createdAt: Date.now(),
        };
        set((state) => ({ moments: [moment, ...state.moments].slice(0, MAX_MOMENTS) }));
        return moment;
      },
      removeMoment: (id) => set((state) => ({ moments: state.moments.filter((m) => m.id !== id) })),
      toggleLike: (id, who) =>
        set((state) => ({
          moments: state.moments.map((moment) => {
            if (moment.id !== id) return moment;
            const liked = moment.likes.includes(who);
            return { ...moment, likes: liked ? moment.likes.filter((l) => l !== who) : [...moment.likes, who] };
          }),
        })),
      addComment: (id, authorName, content) =>
        set((state) => ({
          moments: state.moments.map((moment) =>
            moment.id === id
              ? {
                  ...moment,
                  comments: [
                    ...moment.comments,
                    { id: uid(), authorName, content: content.trim(), at: Date.now() },
                  ],
                }
              : moment,
          ),
        })),
    }),
    {
      name: "purin.moments",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

/** 朋友圈时间展示：x 分钟前 / x 小时前 / 日期 */
export function relativeTime(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(at).toLocaleDateString("zh-CN");
}
