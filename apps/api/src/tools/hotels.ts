import { loadSettings } from "../config.js";

export interface HotelInput {
  name: string;
  area?: string | null;
  rating?: number | null;
  price_per_night: number;
  currency?: string;
  nights?: number | null;
  total?: number | null;
}

export async function getHotels(
  destination: string | null | undefined,
  nights: number | null | undefined,
): Promise<HotelInput[]> {
  const d = (destination || "your destination").trim();
  const n = nights || 3;
  const key = loadSettings().TAVILY_KEY;
  if (!key) throw new Error("TAVILY_KEY is required (live-only, no fixture fallback).");

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query: `best hotels in ${d}`, max_results: 3 }),
  });
  if (!resp.ok) throw new Error(`Tavily ${resp.status}`);
  const payload = (await resp.json()) as { results?: Array<{ title?: string }> };

  return (payload.results ?? []).slice(0, 3).map((hit) => ({
    name: hit.title ?? "Hotel",
    area: null,
    rating: null,
    // Tavily is a search API — it returns hotel names/links, not prices.
    price_per_night: 0,
    currency: "USD",
    nights: n,
    total: 0,
  }));
}
