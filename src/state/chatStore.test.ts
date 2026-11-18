import { describe, expect, it } from "vitest";
import { useChatStore } from "./chatStore";
import { usePhoneStore } from "./phoneStore";

describe("chatStore 流式生命周期", () => {
  it("addUser → startAssistant → appendDelta → finishAssistant", () => {
    const chat = useChatStore.getState();
    chat.addUserMessage("conv-1", "你好");
    const assistantId = chat.startAssistant("conv-1");
    chat.appendDelta("conv-1", assistantId, "早上");
    chat.appendDelta("conv-1", assistantId, "好");
    expect(useChatStore.getState().generating["conv-1"]).toBe(true);
    useChatStore.getState().finishAssistant("conv-1", assistantId);

    const messages = useChatStore.getState().messages["conv-1"] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "你好" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "早上好", status: "done" });
    expect(useChatStore.getState().generating["conv-1"]).toBe(false);
  });

  it("failAssistant 保留错误信息", () => {
    const chat = useChatStore.getState();
    chat.addUserMessage("conv-2", "在吗");
    const assistantId = chat.startAssistant("conv-2");
    useChatStore.getState().failAssistant("conv-2", assistantId, "HTTP 500");

    const messages = useChatStore.getState().messages["conv-2"] ?? [];
    expect(messages[1]).toMatchObject({ status: "error", error: "HTTP 500" });
    expect(useChatStore.getState().generating["conv-2"]).toBe(false);
  });

  it("clearConversation 清空会话", () => {
    useChatStore.getState().addUserMessage("conv-3", "x");
    useChatStore.getState().clearConversation("conv-3");
    expect(useChatStore.getState().messages["conv-3"]).toBeUndefined();
  });

  it("ensureFirstMessage 空会话插开场白、非空不动（P3）", () => {
    useChatStore.getState().clearConversation("conv-4");
    useChatStore.getState().ensureFirstMessage("conv-4", "你来啦！");
    useChatStore.getState().ensureFirstMessage("conv-4", "第二次调用应被忽略");
    let messages = useChatStore.getState().messages["conv-4"] ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "assistant", content: "你来啦！", status: "done" });

    useChatStore.getState().addUserMessage("conv-4", "在吗");
    useChatStore.getState().ensureFirstMessage("conv-4", "不应覆盖");
    messages = useChatStore.getState().messages["conv-4"] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ role: "user", content: "在吗" });
  });
});

describe("phoneStore 导航与角标", () => {
  it("openApp 携带参数并清角标；goHome 回桌面", () => {
    const phone = usePhoneStore.getState();
    phone.bumpBadge("chat");
    expect(usePhoneStore.getState().badges["chat"]).toBe(1);

    phone.openApp("chat", { characterId: "c1" });
    expect(usePhoneStore.getState().activeAppId).toBe("chat");
    expect(usePhoneStore.getState().params["chat"]).toEqual({ characterId: "c1" });
    expect(usePhoneStore.getState().badges["chat"]).toBe(0);

    usePhoneStore.getState().goHome();
    expect(usePhoneStore.getState().activeAppId).toBeNull();
  });
});
