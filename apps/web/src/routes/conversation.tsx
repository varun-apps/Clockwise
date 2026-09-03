import { useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AgentProgress } from "@/components/chat/agent-progress";
import { BlockedNotice } from "@/components/chat/blocked-notice";
import { useChatStream } from "@/components/chat/chat-stream-provider";
import { ChatThread } from "@/components/chat/chat-thread";
import { Composer } from "@/components/chat/composer";
import { PlanResult } from "@/components/chat/plan-result";
import { ReviewPanel } from "@/components/chat/review-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationQuery } from "@/hooks/use-conversations";

const USER_ID = "demo-user";

export function ConversationRoute() {
  const { conversationId } = useParams({ from: "/c/$conversationId" });
  const stream = useChatStream();
  const { data: convo, isLoading } = useConversationQuery(conversationId);

  const isActive = stream.activeConversationId === conversationId;
  const busy = isActive && stream.status === "streaming";
  const messages = convo?.messages ?? [];

  // Auto-scroll to the newest content as the thread / progress updates.
  const bottomRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any turn update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, stream.nodeEvents.length, stream.status]);

  const submitFollowUp = (query: string) => {
    stream.start({ query, conversation_id: conversationId, user_id: USER_ID });
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {isLoading && messages.length === 0 && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {messages.length > 0 && <ChatThread messages={messages} />}

        {isActive && (
          <>
            {stream.status === "streaming" && (
              <AgentProgress
                nodeEvents={stream.nodeEvents}
                selectedAgents={stream.selectedAgents}
                streaming
              />
            )}
            {stream.plan &&
              (stream.status === "awaiting_review" || stream.status === "completed") && (
                <PlanResult plan={stream.plan} />
              )}
            {stream.status === "awaiting_review" && (
              <ReviewPanel
                busy={busy}
                onApprove={() =>
                  stream.resume({ conversation_id: conversationId, action: "approve" })
                }
                onRequestChanges={(feedback) =>
                  stream.resume({
                    conversation_id: conversationId,
                    action: "request_changes",
                    feedback,
                  })
                }
              />
            )}
            {stream.status === "blocked" && stream.plan?.blocked_reason && (
              <BlockedNotice reason={stream.plan.blocked_reason} />
            )}
            {stream.status === "error" && stream.error && <BlockedNotice reason={stream.error} />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-6 py-4">
        <Composer
          onSubmit={submitFollowUp}
          disabled={busy}
          placeholder="Ask a follow-up or plan another trip…"
        />
      </div>
    </div>
  );
}
