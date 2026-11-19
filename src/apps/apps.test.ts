import { describe, expect, it, vi } from "vitest";
import { daysSince, daysToNextAnniversary } from "./anniversary/AnniversaryApp";
import { describeCode, fetchWeather } from "./weather/WeatherApp";

describe("纪念日纯函数", () => {
  it("daysSince：同一天=第 1 天", () => {
    expect(daysSince("2024-01-01", new Date(2024, 0, 1).getTime())).toBe(1);
  });

  it("daysSince：跨月累计", () => {
    expect(daysSince("2024-01-01", new Date(2024, 0, 31).getTime())).toBe(31);
    expect(daysSince("2024-02-01", new Date(2024, 2, 1).getTime())).toBe(30);
  });

  it("daysToNextAnniversary：周年当天=0", () => {
    expect(daysToNextAnniversary("2024-03-01", new Date(2024, 2, 1).getTime())).toBe(0);
  });

  it("daysToNextAnniversary：过完周年顺延到明年", () => {
    expect(daysToNextAnniversary("2024-03-01", new Date(2024, 2, 2).getTime())).toBe(364);
  });

  it("daysToNextAnniversary：跨年计算（2024 为闰年）", () => {
    expect(daysToNextAnniversary("2024-12-31", new Date(2024, 0, 1).getTime())).toBe(365);
    expect(daysToNextAnniversary("2024-05-10", new Date(2024, 11, 30).getTime())).toBe(131);
  });

  it("daysSince 非法日期兜底为 0", () => {
    expect(daysSince("not-a-date", Date.now())).toBe(0);
  });
});

describe("天气", () => {
  it("describeCode：weather_code 映射", () => {
    expect(describeCode(0)).toEqual({ text: "晴", emoji: "☀️" });
    expect(describeCode(3).text).toBe("阴");
    expect(describeCode(61).text).toBe("雨");
    expect(describeCode(71).text).toBe("雪");
    expect(describeCode(95).text).toBe("雷暴");
    expect(describeCode(999).text).toBe("有点看不懂");
  });

  it("fetchWeather：拼 open-meteo 接口并解析字段", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          current: {
            temperature_2m: 21.4,
            apparent_temperature: 20,
            relative_humidity_2m: 55,
            weather_code: 1,
            wind_speed_10m: 8.2,
          },
          daily: { temperature_2m_max: [25], temperature_2m_min: [14] },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch);

    const now = await fetchWeather({ lat: 31.23, lon: 121.47 });
    expect(calls[0]?.url.startsWith("https://api.open-meteo.com/v1/forecast?")).toBe(true);
    expect(calls[0]?.url).toContain("latitude=31.23");
    expect(now.temperature).toBe(21.4);
    expect(now.max).toBe(25);
    expect(now.min).toBe(14);
    expect(now.code).toBe(1);
    expect(now.at).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });

  it("fetchWeather：非 200 抛错", async () => {
    vi.stubGlobal("fetch", (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch);
    await expect(fetchWeather({ lat: 0, lon: 0 })).rejects.toThrow("天气服务返回 503");
    vi.unstubAllGlobals();
  });
});
