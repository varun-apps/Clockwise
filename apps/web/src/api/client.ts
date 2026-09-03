// Typed API client. The request/response shapes come from `generated.ts`,
// which is produced from the backend's OpenAPI schema (`task codegen`). If a
// Pydantic field is renamed, these types change and callers stop type-checking.
import type { components, paths } from "./generated";

export type PlanRequest = paths["/plan"]["post"]["requestBody"]["content"]["application/json"];
export type PlanResponse =
  paths["/plan"]["post"]["responses"]["200"]["content"]["application/json"];
export type ResumeRequest =
  paths["/plan/resume"]["post"]["requestBody"]["content"]["application/json"];
export type HealthResponse = components["schemas"]["HealthResponse"];
export type ConversationRead = components["schemas"]["ConversationRead"];
export type ConversationDetail = components["schemas"]["ConversationDetail"];
export type MessageRead = components["schemas"]["MessageRead"];

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

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

export async function postResume(body: ResumeRequest): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE}/plan/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<PlanResponse>(res);
}

export async function getConversations(): Promise<ConversationRead[]> {
  return json<ConversationRead[]>(await fetch(`${API_BASE}/conversations`));
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return json<ConversationDetail>(await fetch(`${API_BASE}/conversations/${id}`));
}
