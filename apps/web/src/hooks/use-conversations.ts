import { useQuery } from "@tanstack/react-query";
import { getConversation, getConversations } from "@/api/client";

/** Sidebar: all conversations, newest first (server-ordered). */
export function useConversationsQuery() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
  });
}

/** Thread history for one conversation. */
export function useConversationQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => getConversation(id as string),
    enabled: Boolean(id),
  });
}
