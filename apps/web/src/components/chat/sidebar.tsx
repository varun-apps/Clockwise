import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationsQuery } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { data, isLoading } = useConversationsQuery();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="p-3">
        <Link to="/">
          <Button variant="outline" className="w-full justify-start">
            <Plus className="size-4" />
            New chat
          </Button>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        {data?.map((c) => (
          <Link
            key={c.id}
            to="/c/$conversationId"
            params={{ conversationId: c.id }}
            className="block"
          >
            {({ isActive }) => (
              <span
                className={cn(
                  "block truncate rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {c.title || "Untitled trip"}
              </span>
            )}
          </Link>
        ))}
        {data && data.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No trips yet.</p>
        )}
      </nav>
    </aside>
  );
}
