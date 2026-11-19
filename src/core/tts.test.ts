import { describe, expect, it } from "vitest";
import { asrSupported, listen, speak, stopSpeaking, ttsSupported } from "./tts";

/** Node 测试环境没有 window/speechSynthesis：验证全部安全降级 */
describe("tts（Node 环境降级）", () => {
  it("ttsSupported / asrSupported 返回 false", () => {
    expect(ttsSupported()).toBe(false);
    expect(asrSupported()).toBe(false);
  });

  it("speak / stopSpeaking 不抛错", () => {
    expect(() => speak("你好")).not.toThrow();
    expect(() => stopSpeaking()).not.toThrow();
  });

  it("listen 立即回调不支持并返回 no-op 停止函数", () => {
    let done: string | undefined;
    const stop = listen(
      () => undefined,
      (error?: string) => {
        done = error;
      },
    );
    expect(done).toContain("不支持");
    expect(() => stop()).not.toThrow();
  });
});
