import { useEffect, useState } from "react";
import { Globe, Network } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { groupByDomain } from "@/lib/security/domain";
import { useSecurity } from "@/lib/security/store";
import { cn, formatKb } from "@/lib/utils";
import { GroupedActivityList } from "./grouped-list";
import { Panel, PanelHeader } from "./chrome";

export function NetworkPanel() {
  const activities = useSecurity((s) => s.activities);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const droppedPackets = useSecurity((s) => s.droppedPackets);
  const linkKbps = useSecurity((s) => s.linkKbps);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const [filter, setFilter] = useState<"all" | "open" | "inbound" | "outbound" | "dropped">("all");
  const [spark, setSpark] = useState<{ t: string; kbps: number }[]>(() =>
    Array.from({ length: 16 }, (_, i) => ({ t: String(i), kbps: 0 })),
  );

  useEffect(() => {
    setSpark((prev) => [...prev.slice(1), { t: String(Date.now()).slice(-4), kbps: killSwitch ? 0 : linkKbps }]);
  }, [linkKbps, killSwitch]);

  const traffic = activities.filter((a) => a.type === "traffic");
  const items = traffic.filter((a) => {
    if (filter === "dropped") return a.resolveNote === "Network kill switch" || a.status === "blocked";
    if (filter === "open") return a.status === "suspicious" || a.status === "unknown";
    if (filter === "all") return true;
    return a.direction === filter;
  });
  const inbound = traffic.filter((a) => a.direction === "inbound").length;
  const outbound = traffic.filter((a) => a.direction === "outbound").length;
  const dropped = traffic.filter((a) => a.status === "blocked" || a.status === "killed").length;
  const dirTotal = Math.max(1, inbound + outbound + dropped);
  const domains = groupByDomain(traffic)
    .map((g) => ({
      label: g.label,
      kb: g.items.reduce((n, i) => n + (i.dataKb ?? 0), 0),
    }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 8);
  const maxKb = Math.max(1, ...domains.map((d) => d.kb));

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader icon={<Network className="size-4" />} title="Live path" subtitle="Throughput and direction this session" />
        <div className="h-28 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <defs>
                <linearGradient id="gKbps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={killSwitch ? "#f87171" : "#60a5fa"} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={killSwitch ? "#f87171" : "#60a5fa"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="kbps"
                stroke={killSwitch ? "#f87171" : "#60a5fa"}
                fill="url(#gKbps)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-micro text-muted">
          <span className={cn("font-mono text-sm tabular-nums", killSwitch ? "text-red" : "text-fg")}>
            {killSwitch ? 0 : linkKbps} KB/s
          </span>
          <span>{droppedPackets.toLocaleString()} drops</span>
        </div>
        <div className="mt-3 space-y-1.5">
          <DirBar label="Out" value={outbound} total={dirTotal} tone="bg-cyan" />
          <DirBar label="In" value={inbound} total={dirTotal} tone="bg-emerald" />
          <DirBar label="Cut" value={dropped} total={dirTotal} tone="bg-red" />
        </div>
        {killSwitch ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red/20 bg-red-dim px-3 py-2">
            <p className="text-xs text-red">Kill switch armed — Android VPN traffic is dropped when active; Kysmindset third-party requests are blocked.</p>
            <button
              type="button"
              onClick={() => {
                toggleKillSwitch();
                toast.success("Kill switch released — third-party fetches allowed.");
              }}
              className="shrink-0 text-xs font-medium text-fg underline-offset-2 hover:underline"
            >
              Release link
            </button>
          </div>
        ) : null}
      </Panel>
      {domains.length > 0 ? (
        <Panel>
          <PanelHeader icon={<Globe className="size-4" />} title="Hosts this session" subtitle="Volume by registrable domain" />
          <div className="space-y-2">
            {domains.map((d) => (
              <div key={d.label}>
                <div className="mb-1 flex justify-between gap-2 text-micro">
                  <span className="min-w-0 break-all text-fg">{d.label}</span>
                  <span className="shrink-0 font-mono text-subtle">{formatKb(d.kb)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.max(6, (d.kb / maxKb) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      <Panel>
        <PanelHeader icon={<Network className="size-4" />} title="Observed Requests" subtitle="App-session hosts grouped by domain or subnet" />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["all", "open", "inbound", "outbound", "dropped"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs capitalize",
                filter === f ? "border-line-strong bg-white/10 text-fg" : "border-transparent text-muted hover:bg-white/5",
              )}
            >
              {f === "all" ? "Traffic" : f === "open" ? "Needs review" : f}
            </button>
          ))}
        </div>
        <GroupedActivityList
          items={items}
          empty={
            killSwitch
              ? "Kill switch is armed — third-party fetches from this app are failed."
              : "No sockets from this app yet. Hosts this page talks to show up here."
          }
        />
      </Panel>
    </div>
  );
}

function DirBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-2xs text-subtle">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round((value / total) * 100)}%` }} />
      </div>
    </div>
  );
}
