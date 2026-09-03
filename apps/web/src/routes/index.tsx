import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useChatStream } from "@/components/chat/chat-stream-provider";
import { Composer } from "@/components/chat/composer";

const USER_ID = "demo-user";

const EXAMPLES = [
  "Plan a 4 day trip to Dubai next month",
  "Plan a 3 day trip to Tokyo",
  "Plan a weekend trip to London",
];

export function NewChatRoute() {
  const { start, activeConversationId, status } = useChatStream();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Navigate to the conversation route once the stream's `meta` event has
  // created the conversation. This is not a stream kickoff (start() below is),
  // so it's safe under StrictMode.
  useEffect(() => {
    if (submitting && activeConversationId) {
      navigate({ to: "/c/$conversationId", params: { conversationId: activeConversationId } });
      setSubmitting(false);
    }
  }, [submitting, activeConversationId, navigate]);

  const submit = (query: string) => {
    setSubmitting(true);
    start({ query, user_id: USER_ID });
  };

  const busy = submitting || status === "streaming";

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Where to?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your trip and watch the agents plan it live.
        </p>
      </div>
      <div className="w-full">
        <Composer onSubmit={submit} disabled={busy} autoFocus />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => submit(ex)}
            disabled={busy}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
