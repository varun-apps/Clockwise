// SSE client for the streaming plan endpoints. Uses fetch + ReadableStream
// (not EventSource) because EventSource can't POST a body and would auto-reconnect,
// replaying the graph run. The AbortSignal lets callers cancel (e.g. on unmount).
import { API_BASE, type PlanRequest, type ResumeRequest } from "./client";
import type { StreamEvent } from "./events";

/** Parse a single SSE frame (`event: X\ndata: {...}`) into a typed event.
 * Relies on the `type` field carried in the JSON `data:` line. Returns null for
 * empty/keep-alive frames. Exported for unit testing. */
export function parseSseFrame(frame: string): StreamEvent | null {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  const payload = dataLine.slice(dataLine.indexOf(":") + 1).trim();
  if (!payload) return null;
  return JSON.parse(payload) as StreamEvent;
}

type StreamOptions = {
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
};

async function streamSse(
  url: string,
  body: unknown,
  { onEvent, signal }: StreamOptions,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Stream request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseFrame(frame);
      if (event) onEvent(event);
      boundary = buffer.indexOf("\n\n");
    }
  }

  // Flush any trailing frame without a terminating blank line.
  const tail = parseSseFrame(buffer);
  if (tail) onEvent(tail);
}

export function streamPlan(body: PlanRequest, options: StreamOptions): Promise<void> {
  return streamSse(`${API_BASE}/plan/stream`, body, options);
}

export function streamResume(body: ResumeRequest, options: StreamOptions): Promise<void> {
  return streamSse(`${API_BASE}/plan/resume/stream`, body, options);
}
