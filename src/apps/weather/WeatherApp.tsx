import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "../../core/storage";
import type { AppProps } from "../types";

/** 天气 App：open-meteo 免费接口（无需 Key、支持浏览器直连）。
 *  数据持久化上次结果，离线时显示缓存并标注时间。 */

interface WeatherNow {
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  code: number;
  max: number | null;
  min: number | null;
  at: number;
}

interface WeatherState {
  cityId: string;
  now: WeatherNow | null;
  setCity: (id: string) => void;
  setNow: (now: WeatherNow) => void;
}

const CITIES: { id: string; name: string; lat: number; lon: number }[] = [
  { id: "beijing", name: "北京", lat: 39.9, lon: 116.41 },
  { id: "shanghai", name: "上海", lat: 31.23, lon: 121.47 },
  { id: "guangzhou", name: "广州", lat: 23.13, lon: 113.26 },
  { id: "shenzhen", name: "深圳", lat: 22.54, lon: 114.06 },
  { id: "hangzhou", name: "杭州", lat: 30.27, lon: 120.15 },
  { id: "chengdu", name: "成都", lat: 30.57, lon: 104.07 },
  { id: "wuhan", name: "武汉", lat: 30.59, lon: 114.31 },
  { id: "xian", name: "西安", lat: 34.34, lon: 108.94 },
  { id: "nanjing", name: "南京", lat: 32.06, lon: 118.8 },
  { id: "changsha", name: "长沙", lat: 28.23, lon: 112.94 },
  { id: "qingdao", name: "青岛", lat: 36.07, lon: 120.38 },
  { id: "xiamen", name: "厦门", lat: 24.48, lon: 118.09 },
];

export const useWeatherStore = create<WeatherState>()(
  persist(
    (set) => ({
      cityId: "beijing",
      now: null,
      setCity: (id) => set({ cityId: id }),
      setNow: (now) => set({ now }),
    }),
    { name: "purin.app.weather", version: 1, storage: createJSONStorage(() => safeLocalStorage) },
  ),
);

/** open-meteo weather_code → 文案 + emoji */
export function describeCode(code: number): { text: string; emoji: string } {
  if (code === 0) return { text: "晴", emoji: "☀️" };
  if (code <= 2) return { text: "多云", emoji: "⛅" };
  if (code === 3) return { text: "阴", emoji: "☁️" };
  if (code === 45 || code === 48) return { text: "雾", emoji: "🌫" };
  if (code >= 51 && code <= 67) return { text: "雨", emoji: "🌧" };
  if (code >= 71 && code <= 77) return { text: "雪", emoji: "❄️" };
  if (code >= 80 && code <= 82) return { text: "阵雨", emoji: "🌦" };
  if (code >= 95 && code <= 99) return { text: "雷暴", emoji: "⛈" };
  return { text: "有点看不懂", emoji: "🌡" };
}

export async function fetchWeather(
  city: { lat: number; lon: number },
  signal?: AbortSignal,
): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`天气服务返回 ${res.status}`);
  const data = (await res.json()) as {
    current: Record<string, number>;
    daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] };
  };
  return {
    temperature: data.current.temperature_2m,
    apparent: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    wind: data.current.wind_speed_10m,
    code: data.current.weather_code,
    max: data.daily?.temperature_2m_max?.[0] ?? null,
    min: data.daily?.temperature_2m_min?.[0] ?? null,
    at: Date.now(),
  };
}

export default function WeatherApp(_props: AppProps) {
  const cityId = useWeatherStore((s) => s.cityId);
  const now = useWeatherStore((s) => s.now);
  const setCity = useWeatherStore((s) => s.setCity);
  const setNow = useWeatherStore((s) => s.setNow);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const city = CITIES.find((c) => c.id === cityId) ?? CITIES[0];

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchWeather(city);
      setNow(result);
    } catch {
      setError(now ? "刷新失败，先看上次的" : "刷新失败，稍后再试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  const desc = now ? describeCode(now.code) : null;
  const stale = now && Date.now() - now.at > 10 * 60 * 1000;

  return (
    <div className="weather">
      <div className="weather-city">
        <select value={cityId} onChange={(e) => setCity(e.target.value)}>
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {!now && loading && <div className="weather-empty">正在取天气…</div>}
      {!now && !loading && error && <div className="weather-empty">{error}</div>}
      {now && desc && (
        <div className="weather-card">
          <div className="weather-emoji">{desc.emoji}</div>
          <div className="weather-temp">{Math.round(now.temperature)}°</div>
          <div className="weather-desc">
            {desc.text} · 体感 {Math.round(now.apparent)}°
            {stale && <span className="weather-stale">（缓存）</span>}
          </div>
          <div className="weather-meta">
            <span>今 {Math.round(now.max ?? now.temperature)}° / {Math.round(now.min ?? now.temperature)}°</span>
            <span>湿度 {Math.round(now.humidity)}%</span>
            <span>风 {Math.round(now.wind)} km/h</span>
          </div>
          {error && <div className="weather-error">{error}</div>}
        </div>
      )}

      <div className="weather-foot">数据来自 open-meteo.com · {city.name}</div>
    </div>
  );
}
