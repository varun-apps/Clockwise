import { Brain } from "lucide-react";
import type { PlanResponse } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { BudgetCard, FlightsList, HotelsList, WeatherCard } from "./plan-cards";

// Renders the *structured* trip data (weather / flights / hotels / budget /
// reasoning / memory / model calls). The itinerary prose and final summary are
// NOT rendered here — they appear as assistant bubbles in the chat thread, so
// there's no duplication.
export function PlanResult({ plan }: { plan: PlanResponse }) {
  const memory = plan.memory_used ?? [];
  const llmCalls = plan.llm_calls ?? [];

  return (
    <div className="flex flex-col gap-3">
      {plan.reasoning && <p className="text-sm italic text-muted-foreground">{plan.reasoning}</p>}

      {memory.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-info/5 p-2 text-sm">
          <Brain className="size-4 text-info" />
          <span className="text-muted-foreground">Personalized from saved preferences:</span>
          {memory.map((m) => (
            <Badge key={m} variant="info">
              {m}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {plan.weather && <WeatherCard weather={plan.weather} />}
        {plan.budget && <BudgetCard budget={plan.budget} />}
        <FlightsList flights={plan.flights ?? []} />
        <HotelsList hotels={plan.hotels ?? []} />
      </div>

      {llmCalls.length > 0 && (
        <details className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Agents &amp; model calls ({llmCalls.length})
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Selected: {(plan.selected_agents ?? []).join(", ") || "—"}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {llmCalls.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: llm_calls is an append-only ordered log; nodes repeat across revisions
              <li key={`${c.node}-${i}`} className="flex items-center gap-2">
                <Badge variant={c.mocked ? "secondary" : "success"}>
                  {c.mocked ? "mock" : "live"}
                </Badge>
                <span className="font-mono">{c.node}</span>
                <span className="text-muted-foreground">→ {c.model}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
