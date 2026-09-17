import { loadSettings } from "../config.js";

export interface FlightInput {
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  depart_time?: string | null;
  price: number;
  currency?: string;
  duration?: string | null;
}

export async function getFlights(
  origin: string | null | undefined,
  destination: string | null | undefined,
): Promise<FlightInput[]> {
  const o = (origin || "Origin").trim();
  const d = (destination || "your destination").trim();
  const key = loadSettings().AVIATIONSTACK_KEY;
  if (!key) throw new Error("AVIATIONSTACK_KEY is required (live-only, no fixture fallback).");

  const params = new URLSearchParams({ access_key: key, limit: "3" });
  const resp = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
  if (!resp.ok) throw new Error(`AviationStack ${resp.status}`);
  const payload = (await resp.json()) as { data?: Array<Record<string, unknown>> };

  return (payload.data ?? []).slice(0, 3).map((item) => ({
    airline: String((item.airline as Record<string, unknown> | undefined)?.name ?? "Unknown"),
    flight_number: String((item.flight as Record<string, unknown> | undefined)?.iata ?? ""),
    origin: o,
    destination: d,
    depart_time:
      ((item.departure as Record<string, unknown> | undefined)?.scheduled as string | undefined) ??
      null,
    // AviationStack's free tier does not return pricing.
    price: 0,
    currency: "USD",
    duration: null,
  }));
}
