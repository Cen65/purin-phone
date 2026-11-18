import { describe, expect, it } from "vitest";
import { encodeAppRoute, parseAppRoute } from "./deeplink";

/** hash 深链编解码：#/app/{appId}?{params}。 */
describe("deeplink", () => {
  it("编码：字符串参数进查询串", () => {
    expect(encodeAppRoute("chat", { characterId: "c1" })).toBe("#/app/chat?characterId=c1");
    expect(encodeAppRoute("settings")).toBe("#/app/settings");
  });

  it("编码：非字符串参数被丢弃（保持 URL 简单）", () => {
    expect(encodeAppRoute("x", { n: 5 as unknown as string, s: "" })).toBe("#/app/x");
  });

  it("解析：encode → parse 往返一致", () => {
    const route = parseAppRoute(encodeAppRoute("chat", { groupId: "g9" }));
    expect(route).toEqual({ appId: "chat", params: { groupId: "g9" } });
  });

  it("解析：非法 hash 返回 null", () => {
    expect(parseAppRoute("#/nope")).toBeNull();
    expect(parseAppRoute("")).toBeNull();
    expect(parseAppRoute("#/app/")).toBeNull();
  });
});
