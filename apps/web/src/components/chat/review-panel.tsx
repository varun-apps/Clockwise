import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function ReviewPanel({
  busy,
  onApprove,
  onRequestChanges,
}: {
  busy: boolean;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState("");

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Review the draft itinerary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Approve it, or request changes with a note.</p>
        <div>
          <Button variant="success" onClick={onApprove} disabled={busy}>
            <Check className="size-4" />
            Approve
          </Button>
        </div>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          disabled={busy}
          placeholder="What should change? (e.g. add a beach day, cheaper hotel)"
          className="resize-none"
        />
        <div>
          <Button
            variant="outline"
            onClick={() => onRequestChanges(feedback)}
            disabled={busy || !feedback.trim()}
          >
            <Pencil className="size-4" />
            Request changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
