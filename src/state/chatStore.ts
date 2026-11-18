import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../core/storage";
import { uid } from "../core/id";

export type MessageStatus = "streaming" | "done" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status?: MessageStatus;
  /** status === "error" 时的失败原因 */
  error?: string;
  /** 群聊里发这条消息的角色 id（单聊为空，代表对面唯一角色） */
  speakerId?: string;
}

interface ChatState {
  /** conversationId（单聊=characterId，群聊="group:"+groupId）→ 消息列表 */
  messages: Record<string, ChatMessage[]>;
  /** 会话是否正在生成（UI 据此禁用发送按钮） */
  generating: Record<string, boolean>;
  addUserMessage: (conversationId: string, content: string) => ChatMessage;
  startAssistant: (conversationId: string, speakerId?: string) => string;
  appendDelta: (conversationId: string, messageId: string, delta: string) => void;
  finishAssistant: (conversationId: string, messageId: string) => void;
  failAssistant: (conversationId: string, messageId: string, error: string) => void;
  /** 直接插入一条已完成的消息（通话转写等非流式来源） */
  insertMessage: (conversationId: string, role: "user" | "assistant", content: string, speakerId?: string) => void;
  clearConversation: (conversationId: string) => void;
}

function append(state: ChatState, conversationId: string, message: ChatMessage): Record<string, ChatMessage[]> {
  return { ...state.messages, [conversationId]: [...(state.messages[conversationId] ?? []), message] };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: {},
      generating: {},
      addUserMessage: (conversationId, content) => {
        const message: ChatMessage = {
          id: uid(),
          role: "user",
          content,
          createdAt: Date.now(),
          status: "done",
        };
        set((state) => ({ messages: append(state, conversationId, message) }));
        return message;
      },
      startAssistant: (conversationId, speakerId) => {
        const id = uid();
        const placeholder: ChatMessage = {
          id,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          status: "streaming",
          speakerId,
        };
        set((state) => ({
          messages: append(state, conversationId, placeholder),
          generating: { ...state.generating, [conversationId]: true },
        }));
        return id;
      },
      appendDelta: (conversationId, messageId, delta) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((message) =>
              message.id === messageId ? { ...message, content: message.content + delta } : message,
            ),
          },
        })),
      finishAssistant: (conversationId, messageId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((message) =>
              message.id === messageId ? { ...message, status: "done" } : message,
            ),
          },
          generating: { ...state.generating, [conversationId]: false },
        })),
      failAssistant: (conversationId, messageId, error) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((message) =>
              message.id === messageId ? { ...message, status: "error", error } : message,
            ),
          },
          generating: { ...state.generating, [conversationId]: false },
        })),
      insertMessage: (conversationId, role, content, speakerId) => {
        const message: ChatMessage = {
          id: uid(),
          role,
          content,
          createdAt: Date.now(),
          status: "done",
          speakerId,
        };
        set((state) => ({ messages: append(state, conversationId, message) }));
      },
      clearConversation: (conversationId) =>
        set((state) => {
          const messages = { ...state.messages };
          delete messages[conversationId];
          return { messages };
        }),
    }),
    {
      name: "purin.chat",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ messages: state.messages }),
    },
  ),
);
