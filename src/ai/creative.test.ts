import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/imageStore", () => ({
  saveImage: async () => "img-fixed",
  loadImage: async () => null,
  deleteImage: async () => undefined,
}));

import { generateMoment } from "./creative";
import { registerProvider } from "./providers";
import type { LLMProvider, ChatRequest, ImageGenRequest } from "./types";
import { useSettingsStore } from "../state/settingsStore";
import { useCharactersStore } from "../state/charactersStore";
import { useMomentsStore } from "../state/momentsStore";

const chatCalls: string[] = [];
const imageCalls: ImageGenRequest[] = [];

const fake: LLMProvider = {
  id: "fake",
  label: "测试",
  chat: async (request: ChatRequest) => {
    chatCalls.push(request.messages.at(-1)?.content ?? "");
    return { content: "今天路过一家甜品店，突然想到你。#日常" };
  },
  generateImage: async (request: ImageGenRequest) => {
    imageCalls.push(request);
    return { dataUrl: "data:image/png;base64,xxx" };
  },
};

registerProvider(fake);

const character = { id: "c1", name: "小绿", avatar: "🌱", tagline: "元气满满", systemPrompt: "", createdAt: 0 };

describe("generateMoment 朋友圈配图", () => {
  beforeEach(() => {
    chatCalls.length = 0;
    imageCalls.length = 0;
    useMomentsStore.setState({ moments: [] });
    useCharactersStore.setState({ characters: [character] });
  });

  it("配置了生图模型时：生成正文 + 配图并把 imageId 存进动态", async () => {
    useSettingsStore.setState({
      api: { provider: "fake", baseUrl: "x", apiKey: "x", model: "x" },
      imageModel: "kolors",
      momentImageOn: true,
    });
    const moment = await generateMoment("c1");
    expect(moment).not.toBeNull();
    expect(moment?.text).toContain("甜品店");
    expect(moment?.imageId).toBe("img-fixed");
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0]?.model).toBe("kolors");
    expect(imageCalls[0]?.prompt).toContain("甜品店");
    expect(imageCalls[0]?.prompt).toContain("小绿");
  });

  it("没配生图模型：只发文字，不调 generateImage", async () => {
    useSettingsStore.setState({
      api: { provider: "fake", baseUrl: "x", apiKey: "x", model: "x" },
      imageModel: "",
      momentImageOn: true,
    });
    const moment = await generateMoment("c1");
    expect(moment).not.toBeNull();
    expect(moment?.imageId).toBeUndefined();
    expect(imageCalls).toHaveLength(0);
    expect(chatCalls).toHaveLength(1);
  });
});
