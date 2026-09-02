// Typed API client. The request/response shapes come from `generated.ts`,
// which is produced from the backend's OpenAPI schema (`task codegen`). If a
// Pydantic field is renamed, these types change and callers stop type-checking.
import type { components, paths } from "./generated";

export type PlanRequest = paths["/plan"]["post"]["requestBody"]["content"]["application/json"];
export type PlanResponse =
  paths["/plan"]["post"]["responses"]["200"]["content"]["application/json"];
export type HealthResponse = components["schemas"]["HealthResponse"];

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return json<HealthResponse>(await fetch(`${API_BASE}/health`));
}

export async function postPlan(body: PlanRequest): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<PlanResponse>(res);
}
