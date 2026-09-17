import { loadSettings } from "../config.js";

export interface WeatherInput {
  destination: string;
  summary: string;
  avg_high_c?: number | null;
  avg_low_c?: number | null;
  conditions?: string[];
}

interface ForecastItem {
  dt_txt?: string;
  main?: { temp_max?: number; temp_min?: number };
  weather?: Array<{ main?: string; description?: string }>;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

export async function getWeather(
  destination: string | null | undefined,
  days: number | null | undefined,
): Promise<WeatherInput> {
  const d = (destination || "your destination").trim();
  const key = loadSettings().OPENWEATHERMAP_KEY;
  if (!key) throw new Error("OPENWEATHERMAP_KEY is required (live-only, no fixture fallback).");

  // 5-day / 3-hour forecast gives real per-day highs/lows to average over the trip.
  const params = new URLSearchParams({ q: d, appid: key, units: "metric" });
  const resp = await fetch(`https://api.openweathermap.org/data/2.5/forecast?${params}`);
  if (!resp.ok) throw new Error(`OpenWeatherMap ${resp.status}`);
  const data = (await resp.json()) as { list?: ForecastItem[] };

  const byDay = new Map<string, { high: number; low: number; conditions: string[] }>();
  for (const item of data.list ?? []) {
    const date = (item.dt_txt ?? "").slice(0, 10);
    if (!date) continue;
    const day = byDay.get(date) ?? { high: -Infinity, low: Infinity, conditions: [] };
    day.high = Math.max(day.high, item.main?.temp_max ?? -Infinity);
    day.low = Math.min(day.low, item.main?.temp_min ?? Infinity);
    for (const w of item.weather ?? []) {
      if (w.description && !day.conditions.includes(w.description))
        day.conditions.push(w.description);
    }
    byDay.set(date, day);
  }

  const windowDays = Math.max(1, Math.min(days ?? 3, byDay.size));
  const daysArray = [...byDay.values()].slice(0, windowDays);
  const conditions = [...new Set(daysArray.flatMap((x) => x.conditions))].slice(0, 5);

  return {
    destination: d,
    summary: conditions[0] ?? "Forecast conditions.",
    avg_high_c: average(daysArray.map((x) => x.high).filter(Number.isFinite)),
    avg_low_c: average(daysArray.map((x) => x.low).filter(Number.isFinite)),
    conditions,
  };
}
