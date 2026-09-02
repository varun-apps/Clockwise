import { useMutation, useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { getHealth, type PlanResponse, postPlan, postResume } from "../api/client";

export function Home() {
  const [query, setQuery] = useState("Plan a 4 day trip to Dubai next month");
  const [result, setResult] = useState<PlanResponse | null>(null);
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const plan = useMutation({ mutationFn: postPlan, onSuccess: setResult });
  const resume = useMutation({ mutationFn: postResume, onSuccess: setResult });

  const busy = plan.isPending || resume.isPending;
  const error = (plan.error ?? resume.error) as Error | null;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>ClockWise</h1>
        <p style={styles.sub}>Multi-agent trip planner — with human review</p>
        {health.data && (
          <span style={styles.badge}>
            LLM: {health.data.llm_mode} · Langfuse: {health.data.langfuse}
          </span>
        )}
      </header>

      <form
        style={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          // Stable user id so long-term preferences carry across trips.
          plan.mutate({ query, user_id: "demo-user" });
        }}
      >
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          style={styles.textarea}
          placeholder="Describe your trip…"
        />
        <button type="submit" style={styles.button} disabled={busy}>
          {plan.isPending ? "Planning…" : "Plan my trip"}
        </button>
      </form>

      {error && <p style={styles.error}>{error.message}</p>}
      {result && <PlanView data={result} />}
      {result?.status === "awaiting_review" && (
        <ReviewActions
          busy={busy}
          onApprove={() =>
            resume.mutate({ conversation_id: result.conversation_id, action: "approve" })
          }
          onRequestChanges={(feedback) =>
            resume.mutate({
              conversation_id: result.conversation_id,
              action: "request_changes",
              feedback,
            })
          }
        />
      )}
    </main>
  );
}

function ReviewActions({
  busy,
  onApprove,
  onRequestChanges,
}: {
  busy: boolean;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  return (
    <section style={styles.review}>
      <strong>Review the draft itinerary</strong>
      <p style={styles.muted}>Approve it, or request changes with a note.</p>
      <div style={styles.reviewRow}>
        <button type="button" style={styles.approve} onClick={onApprove} disabled={busy}>
          {busy ? "Working…" : "Approve"}
        </button>
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        style={styles.textarea}
        placeholder="What should change? (e.g. add a beach day)"
      />
      <button
        type="button"
        style={styles.changes}
        onClick={() => onRequestChanges(feedback)}
        disabled={busy || !feedback.trim()}
      >
        Request changes
      </button>
    </section>
  );
}

function PlanView({ data }: { data: PlanResponse }) {
  if (data.status === "blocked") {
    return (
      <section style={styles.card}>
        <h2 style={styles.h2}>Request blocked</h2>
        <p>{data.blocked_reason}</p>
      </section>
    );
  }
  const flights = data.flights ?? [];
  const hotels = data.hotels ?? [];
  const memory = data.memory_used ?? [];
  return (
    <section style={styles.card}>
      {data.summary && <p style={styles.summaryText}>{data.summary}</p>}
      {memory.length > 0 && (
        <div style={styles.memory}>
          <strong>🧠 Personalized from saved preferences:</strong> {memory.join(", ")}
        </div>
      )}
      {data.reasoning && <p style={styles.reasoning}>{data.reasoning}</p>}
      {data.weather && (
        <div style={styles.weather}>
          <strong>{data.weather.destination}:</strong> {data.weather.summary}
        </div>
      )}

      {(flights.length > 0 || hotels.length > 0) && (
        <div style={styles.grid}>
          {flights.length > 0 && (
            <div>
              <h3 style={styles.h3}>Flights</h3>
              <ul style={styles.list}>
                {flights.map((f) => (
                  <li key={f.flight_number}>
                    {f.airline} {f.flight_number} — {f.currency} {f.price}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hotels.length > 0 && (
            <div>
              <h3 style={styles.h3}>Hotels</h3>
              <ul style={styles.list}>
                {hotels.map((h) => (
                  <li key={h.name}>
                    {h.name} — {h.currency} {h.price_per_night}/night
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {data.budget && (
        <div style={styles.budget}>
          <strong>Estimated total:</strong> {data.budget.currency}{" "}
          {data.budget.grand_total?.toLocaleString()} &nbsp;
          <span style={styles.muted}>
            (flights {data.budget.flights_total}, hotels {data.budget.hotels_total})
          </span>
        </div>
      )}

      <pre style={styles.itinerary}>{data.itinerary_plan}</pre>
      <details>
        <summary style={styles.summary}>Agents &amp; model calls</summary>
        <p>Selected: {(data.selected_agents ?? []).join(", ") || "—"}</p>
        <ul>
          {(data.llm_calls ?? []).map((c) => (
            <li key={c.node}>
              {c.node} → {c.model} {c.mocked ? "(mock)" : "(live)"}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" },
  header: { marginBottom: 20 },
  h1: { margin: 0, fontSize: 32 },
  h2: { marginTop: 0 },
  sub: { color: "#5b6472", margin: "4px 0" },
  badge: {
    display: "inline-block",
    fontSize: 12,
    color: "#6e56cf",
    border: "1px solid #d3dae3",
    borderRadius: 20,
    padding: "2px 10px",
  },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  textarea: {
    padding: 12,
    borderRadius: 8,
    border: "1px solid #d3dae3",
    fontSize: 15,
    fontFamily: "inherit",
    resize: "vertical",
  },
  button: {
    alignSelf: "flex-start",
    background: "#6e56cf",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 15,
    cursor: "pointer",
  },
  card: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    border: "1px solid #d3dae3",
    background: "#fff",
  },
  review: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    border: "1px dashed #d9730d",
    background: "rgba(217,115,13,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  reviewRow: { display: "flex", gap: 10 },
  approve: {
    background: "#2f9e63",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 15,
    cursor: "pointer",
  },
  changes: {
    alignSelf: "flex-start",
    background: "#fff",
    color: "#d9730d",
    border: "1px solid #d9730d",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 14,
    cursor: "pointer",
  },
  memory: {
    margin: "10px 0",
    padding: 10,
    background: "rgba(14,139,139,0.08)",
    borderRadius: 8,
    fontSize: 13.5,
    color: "#0e8b8b",
  },
  summaryText: { fontSize: 16, lineHeight: 1.5, marginTop: 0 },
  reasoning: { color: "#5b6472", fontStyle: "italic" },
  weather: { margin: "10px 0", padding: 10, background: "#f6f8fb", borderRadius: 8 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "12px 0" },
  h3: { fontSize: 14, margin: "0 0 6px", color: "#3e63dd" },
  list: { margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 },
  budget: {
    margin: "10px 0",
    padding: 10,
    background: "#f0fbf4",
    borderRadius: 8,
    fontSize: 14,
  },
  muted: { color: "#5b6472", fontSize: 12.5 },
  itinerary: { whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 15, lineHeight: 1.6 },
  summary: { cursor: "pointer", color: "#6e56cf" },
  error: { color: "#e5484d", marginTop: 16 },
};
