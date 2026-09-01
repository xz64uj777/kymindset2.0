import { useMemo, useState } from "react";
import { Ban, Check, ChevronDown, Globe } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { groupByDomain } from "@/lib/security/domain";
import type { SecurityActivity } from "@/lib/security/types";
import { useSecurity } from "@/lib/security/store";
import { cn } from "@/lib/utils";
import { ActivityRow } from "./activity-row";

export function GroupedActivityList({
  items,
  empty,
}: {
  items: SecurityActivity[];
  empty: string;
}) {
  const groups = useMemo(() => groupByDomain(items), [items]);
  const allow = useSecurity((s) => s.allow);
  const block = useSecurity((s) => s.block);
  const threatIds = useMemo(
    () =>
      new Set(
        items.filter((i) => i.status === "suspicious" || i.status === "unknown").map((i) => i.id),
      ),
    [items],
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (items.length === 0) return <p className="py-8 text-center text-xs text-subtle">{empty}</p>;

  return (
    <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
      {groups.map((g) => {
        const pending = g.items.filter((i) => threatIds.has(i.id));
        const expanded = open[g.key] ?? (g.items.length === 1 || pending.length > 0);
        if (g.items.length === 1) {
          return <ActivityRow key={g.items[0]!.id} item={g.items[0]!} />;
        }
        return (
          <div key={g.key} className="overflow-hidden rounded-md border border-line bg-surface">
            <div className="flex items-start gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [g.key]: !expanded }))}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
              >
                <Globe className="mt-0.5 size-3.5 shrink-0 text-cyan" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="break-all text-sm font-medium text-fg">{g.label}</span>
                    <Badge tone="muted">{g.items.length}</Badge>
                    {pending.length > 0 ? <Badge tone="rose">{pending.length} open</Badge> : null}
                    {g.kind === "ip" ? <Badge tone="amber">subnet</Badge> : null}
                  </div>
                  <p className="text-2xs text-subtle">
                    {g.kind === "domain"
                      ? "Same registrable domain"
                      : g.kind === "ip"
                        ? "Same /24 subnet"
                        : "Grouped local activity"}
                  </p>
                </div>
                <ChevronDown
                  className={cn("mt-0.5 size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")}
                />
              </button>
              {pending.length > 0 ? (
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button
                    type="button"
                    title={`Allow all under ${g.label}`}
                    onClick={() => {
                      pending.forEach((i) => allow(i.id));
                      toast.success(`Allowed ${pending.length} on ${g.label}`);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald/25 bg-emerald-dim px-2.5 py-1 text-2xs font-medium text-emerald"
                  >
                    <Check className="size-3" />
                    All
                  </button>
                  <button
                    type="button"
                    title={`Block all under ${g.label}`}
                    onClick={() => {
                      pending.forEach((i) => block(i.id, `Blocked with ${g.label}`));
                      toast.success(`Blocked ${pending.length} on ${g.label}`);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-red/25 bg-red-dim px-2.5 py-1 text-2xs font-medium text-red"
                  >
                    <Ban className="size-3" />
                    All
                  </button>
                </div>
              ) : null}
            </div>
            {expanded ? (
              <div className="space-y-2 border-t border-line p-2">
                {g.items.map((i) => (
                  <ActivityRow key={i.id} item={i} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
