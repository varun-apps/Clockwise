import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { getHealth } from "@/api/client";
import { ChatStreamProvider } from "@/components/chat/chat-stream-provider";
import { Sidebar } from "@/components/chat/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";

function HealthBadge() {
  const { data } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  if (!data) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={data.llm_mode === "live" ? "success" : "secondary"}>
        LLM: {data.llm_mode}
      </Badge>
      <Badge variant={data.langfuse === "enabled" ? "success" : "secondary"}>
        Langfuse: {data.langfuse}
      </Badge>
    </div>
  );
}

export function AppLayout() {
  return (
    <ChatStreamProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h1 className="text-lg font-semibold">ClockWise</h1>
              <p className="text-xs text-muted-foreground">
                Multi-agent trip planner — with human review
              </p>
            </div>
            <div className="flex items-center gap-3">
              <HealthBadge />
              <ModeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </ChatStreamProvider>
  );
}
