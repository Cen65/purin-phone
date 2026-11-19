import { describe, expect, it } from "vitest";
import { deleteImage, loadImage, saveImage } from "./imageStore";

/** Node 测试环境没有 indexedDB：验证全部安全降级 */
describe("imageStore（Node 环境降级）", () => {
  it("saveImage 返回空串（不抛错）", async () => {
    await expect(saveImage("data:image/png;base64,xxx")).resolves.toBe("");
  });

  it("loadImage / deleteImage 静默返回", async () => {
    await expect(loadImage("whatever")).resolves.toBeNull();
    await expect(deleteImage("whatever")).resolves.toBeUndefined();
  });
});
