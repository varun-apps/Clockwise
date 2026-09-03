import { Check, Loader2 } from "lucide-react";
import type { PlanResponse } from "@/api/client";
import { cn } from "@/lib/utils";

type Stage = { key: string; label: string; specialist?: boolean };

// Ordered pipeline stages the user cares about. Specialist stages are only shown
// when the supervisor actually selected them (from the supervisor node event).
const STAGES: Stage[] = [
  { key: "supervisor", label: "Understanding request" },
  { key: "flight", label: "Flights", specialist: true },
  { key: "hotel", label: "Hotels", specialist: true },
  { key: "weather", label: "Weather", specialist: true },
  { key: "budget", label: "Budget" },
  { key: "itinerary", label: "Itinerary" },
];

export function AgentProgress({
  nodeEvents,
  selectedAgents,
  streaming,
}: {
  nodeEvents: string[];
  selectedAgents: PlanResponse["selected_agents"] | null;
  streaming: boolean;
}) {
  const selected = selectedAgents ?? [];
  const stages = STAGES.filter(
    (s) => !s.specialist || selected.length === 0 || selected.includes(s.key as never),
  );
  const done = new Set(nodeEvents);
  const firstPending = stages.find((s) => !done.has(s.key));

  return (
    <div className="flex flex-wrap gap-2" aria-live="polite">
      {stages.map((s) => {
        const isDone = done.has(s.key);
        const isActive = streaming && !isDone && s.key === firstPending?.key;
        return (
          <span
            key={s.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isDone && "border-success/40 bg-success/10 text-success",
              isActive && "border-primary/40 bg-primary/10 text-primary",
              !isDone && !isActive && "border-border bg-muted text-muted-foreground",
            )}
          >
            {isDone ? (
              <Check className="size-3" />
            ) : isActive ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <span className="size-3 rounded-full border border-current opacity-40" />
            )}
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
