// Owns the in-flight streaming turn at the layout level so it survives the
// index -> /c/$id navigation (the stream is what *creates* the conversation, so
// its state must outlive the route change). Streaming is kicked off only from
// event handlers (start/resume), never a useEffect — the primary defense against
// StrictMode double-invoking the graph run. A ref guard drops overlapping starts.
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import type { PlanRequest, PlanResponse, ResumeRequest } from "@/api/client";
import type { StreamEvent } from "@/api/events";
import { streamPlan, streamResume } from "@/api/stream";

export type StreamStatus =
  | "idle"
  | "streaming"
  | "awaiting_review"
  | "completed"
  | "blocked"
  | "error";

export interface ChatStreamState {
  status: StreamStatus;
  activeConversationId: string | null;
  /** Node names that have completed this turn, in order. */
  nodeEvents: string[];
  /** Specialists the supervisor selected (from the supervisor node event). */
  selectedAgents: PlanResponse["selected_agents"] | null;
  plan: PlanResponse | null;
  error: string | null;
}

interface ChatStreamContextValue extends ChatStreamState {
  start: (body: PlanRequest) => void;
  resume: (body: ResumeRequest) => void;
  reset: () => void;
}

const INITIAL: ChatStreamState = {
  status: "idle",
  activeConversationId: null,
  nodeEvents: [],
  selectedAgents: null,
  plan: null,
  error: null,
};

const ChatStreamContext = createContext<ChatStreamContextValue | undefined>(undefined);

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ChatStreamState>(INITIAL);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback(
    (conversationIdRef: { current: string | null }) => (event: StreamEvent) => {
      switch (event.type) {
        case "meta":
          conversationIdRef.current = event.conversation_id;
          setState((s) => ({
            ...s,
            status: "streaming",
            activeConversationId: event.conversation_id,
          }));
          break;
        case "node":
          setState((s) => ({
            ...s,
            nodeEvents: [...s.nodeEvents, event.node],
            selectedAgents: event.selected_agents ?? s.selectedAgents,
          }));
          break;
        case "completed":
        case "awaiting_review":
        case "blocked":
          setState((s) => ({ ...s, status: event.type, plan: event.plan }));
          break;
        case "error":
          setState((s) => ({ ...s, status: "error", error: event.message }));
          break;
      }
    },
    [],
  );

  const runStream = useCallback(
    async (
      run: (opts: { onEvent: (e: StreamEvent) => void; signal: AbortSignal }) => Promise<void>,
      base: Partial<ChatStreamState>,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;

      const controller = new AbortController();
      controllerRef.current = controller;
      const convoRef = { current: state.activeConversationId };

      setState((s) => ({
        ...INITIAL,
        activeConversationId: s.activeConversationId,
        ...base,
        status: "streaming",
      }));

      try {
        await run({ onEvent: handleEvent(convoRef), signal: controller.signal });
        // Persisted history now has the new messages — refetch it and the list.
        if (convoRef.current) {
          queryClient.invalidateQueries({ queryKey: ["conversation", convoRef.current] });
        }
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState((s) => ({ ...s, status: "error", error: (err as Error).message }));
        }
      } finally {
        inFlight.current = false;
      }
    },
    [handleEvent, queryClient, state.activeConversationId],
  );

  const start = useCallback(
    (body: PlanRequest) => {
      void runStream((opts) => streamPlan(body, opts), {
        activeConversationId: body.conversation_id ?? null,
      });
    },
    [runStream],
  );

  const resume = useCallback(
    (body: ResumeRequest) => {
      void runStream((opts) => streamResume(body, opts), {
        activeConversationId: body.conversation_id,
      });
    },
    [runStream],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    inFlight.current = false;
    setState(INITIAL);
  }, []);

  return (
    <ChatStreamContext value={{ ...state, start, resume, reset }}>{children}</ChatStreamContext>
  );
}

export function useChatStream(): ChatStreamContextValue {
  const ctx = useContext(ChatStreamContext);
  if (ctx === undefined) {
    throw new Error("useChatStream must be used within a ChatStreamProvider");
  }
  return ctx;
}
