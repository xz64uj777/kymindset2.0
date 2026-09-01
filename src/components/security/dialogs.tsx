import { Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSecurity } from "@/lib/security/store";
import { useState } from "react";
import { toast } from "sonner";

export function DecisionDialog() {
  const pending = useSecurity((s) => s.pendingDecision);
  const decide = useSecurity((s) => s.decide);
  const setPending = useSecurity((s) => s.setPending);
  if (!pending) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && setPending(null)}>
      <DialogContent>
        <DialogTitle>Security Decision Required</DialogTitle>
        <DialogDescription>
          An unknown or suspicious activity needs your decision.
        </DialogDescription>
        <div className="mt-3 rounded-md border border-line bg-elevated p-3">
          <div className="text-sm font-medium text-fg">{pending.name}</div>
          <p className="mt-1 text-xs text-muted">{pending.details || "No details available"}</p>
          <p className="mt-2 text-micro text-subtle">
            Rule-based recommendation · source: app telemetry
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" variant="ghost" onClick={() => decide(pending.id, "allow")}>
            Allow once
          </Button>
          <Button size="sm" variant="ghost" onClick={() => decide(pending.id, "allowlist")}>
            Allow + Allowlist
          </Button>
          <Button size="sm" variant="danger" onClick={() => decide(pending.id, "block")}>
            Block this item only
          </Button>
          <Button size="sm" variant="danger" onClick={() => decide(pending.id, "subnet")}>
            Block + Subnet
          </Button>
          <Button size="sm" variant="subtle" onClick={() => decide(pending.id, "monitor")}>
            Monitor Only
          </Button>
          <Button size="sm" variant="danger" onClick={() => decide(pending.id, "lockdown")}>
            Trigger Lockdown
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SosDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [sending, setSending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2">
          <Siren className="size-4 text-red" />
          Send SOS Alert?
        </DialogTitle>
        <DialogDescription>Notifies emergency contacts</DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={sending}
            onClick={() => {
              setSending(true);
              window.setTimeout(() => {
                setSending(false);
                onOpenChange(false);
                toast.success("SOS alert sent to emergency contacts");
              }, 700);
            }}
          >
            {sending ? "Sending…" : "Send SOS"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
