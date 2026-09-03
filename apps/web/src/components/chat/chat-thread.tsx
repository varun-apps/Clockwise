import type { MessageRead } from "@/api/client";
import { MessageBubble } from "./message-bubble";

export function ChatThread({ messages }: { messages: MessageRead[] }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}
