import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";
import { uid } from "../core/id";
import type { Character } from "../types";

/**
 * 群聊：多个 AI 角色在同一会话里轮流发言。
 * 群的会话 id 约定为 `group:{groupId}`（见 groupConversationId），
 * 消息本体仍在 chatStore，speakerId 标记是哪位角色说的。
 */

export interface Group {
  id: string;
  name: string;
  /** 成员角色 id，按加入顺序轮流发言 */
  memberIds: string[];
  createdAt: number;
}

interface GroupsState {
  groups: Group[];
  addGroup: (name: string, memberIds: string[]) => Group;
  updateGroup: (id: string, patch: Partial<Pick<Group, "name" | "memberIds">>) => void;
  removeGroup: (id: string) => void;
}

export const useGroupsStore = create<GroupsState>()(
  persist(
    (set) => ({
      groups: [],
      addGroup: (name, memberIds) => {
        const group: Group = {
          id: uid(),
          name: name.trim() || "新群聊",
          memberIds: [...new Set(memberIds)],
          createdAt: Date.now(),
        };
        set((state) => ({ groups: [...state.groups, group] }));
        return group;
      },
      updateGroup: (id, patch) =>
        set((state) => ({
          groups: state.groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
        })),
      removeGroup: (id) => set((state) => ({ groups: state.groups.filter((group) => group.id !== id) })),
    }),
    {
      name: "purin.groups",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

/** 群聊在 chatStore 里的会话 id */
export function groupConversationId(groupId: string): string {
  return `group:${groupId}`;
}

/** 解析会话 id：群聊返回 groupId，单聊（=characterId）返回 null */
export function parseGroupConversation(conversationId: string): string | null {
  return conversationId.startsWith("group:") ? conversationId.slice("group:".length) : null;
}

/** 过滤掉已被删除的成员，返回仍然存在的角色 */
export function livingMembers(group: Group, characters: Character[]): Character[] {
  return group.memberIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character));
}
