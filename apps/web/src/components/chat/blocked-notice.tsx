import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BlockedNotice({ reason }: { reason: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader className="flex-row items-center gap-2 pb-2">
        <ShieldAlert className="size-4 text-destructive" />
        <CardTitle className="text-sm">Request blocked</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{reason}</CardContent>
    </Card>
  );
}
