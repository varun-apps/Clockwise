import { Cloud, Hotel as HotelIcon, Plane, Wallet } from "lucide-react";
import type { PlanResponse } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Weather = NonNullable<PlanResponse["weather"]>;
type Flight = NonNullable<PlanResponse["flights"]>[number];
type Hotel = NonNullable<PlanResponse["hotels"]>[number];
type Budget = NonNullable<PlanResponse["budget"]>;

function money(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  return `${currency} ${value.toLocaleString()}`;
}

export function WeatherCard({ weather }: { weather: Weather }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <Cloud className="size-4 text-info" />
        <CardTitle className="text-sm">Weather · {weather.destination}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>{weather.summary}</p>
        {(weather.avg_high_c != null || weather.avg_low_c != null) && (
          <p className="mt-1">
            High {weather.avg_high_c ?? "—"}°C · Low {weather.avg_low_c ?? "—"}°C
          </p>
        )}
        {(weather.conditions?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {weather.conditions?.map((c) => (
              <Badge key={c} variant="info">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FlightsList({ flights }: { flights: Flight[] }) {
  if (flights.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <Plane className="size-4 text-primary" />
        <CardTitle className="text-sm">Flights</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {flights.map((f) => (
          <div key={f.flight_number} className="flex items-center justify-between text-sm">
            <span>
              {f.airline} {f.flight_number}
              <span className="text-muted-foreground">
                {" "}
                · {f.origin}→{f.destination}
                {f.duration ? ` · ${f.duration}` : ""}
              </span>
            </span>
            <span className="font-medium">{money(f.price, f.currency)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HotelsList({ hotels }: { hotels: Hotel[] }) {
  if (hotels.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <HotelIcon className="size-4 text-primary" />
        <CardTitle className="text-sm">Hotels</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {hotels.map((h) => (
          <div key={h.name} className="flex items-center justify-between text-sm">
            <span>
              {h.name}
              <span className="text-muted-foreground">
                {h.area ? ` · ${h.area}` : ""}
                {h.rating != null ? ` · ★${h.rating}` : ""}
              </span>
            </span>
            <span className="font-medium">{money(h.price_per_night, h.currency)}/night</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function BudgetCard({ budget }: { budget: Budget }) {
  const c = budget.currency;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <Wallet className="size-4 text-success" />
        <CardTitle className="text-sm">Budget</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Estimated total</span>
          <span className="text-lg font-semibold">{money(budget.grand_total, c)}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <span>Flights {money(budget.flights_total, c)}</span>
          <span>Hotels {money(budget.hotels_total, c)}</span>
          <span>Daily {money(budget.daily_estimate, c)}</span>
        </div>
        {budget.notes && <p className="mt-2 text-xs text-muted-foreground">{budget.notes}</p>}
      </CardContent>
    </Card>
  );
}
