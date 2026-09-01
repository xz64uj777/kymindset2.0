import {
  Activity,
  Bell,
  Brain,
  Camera,
  Clipboard,
  Database,
  Download,
  EyeOff,
  FileWarning,
  Globe,
  History,
  KeyRound,
  Lock,
  MapPin,
  MemoryStick,
  Mic,
  Network,
  Plus,
  Radar,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { requestNative } from "@/lib/native";
import { useScore, useSecurity } from "@/lib/security/store";
import type { ActivityType, DecoyType, SecurityActivity } from "@/lib/security/types";
import { cn, timeAgo } from "@/lib/utils";
import { ActivityRow } from "./activity-row";
import { Panel, PanelHeader, ScoreTone, StatusDot } from "./chrome";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { InstallBar, useInstallState } from "./install-bar";

function List({
  items,
  empty,
}: {
  items: SecurityActivity[];
  empty: string;
}) {
  if (items.length === 0)
    return <p className="py-8 text-center text-xs text-subtle">{empty}</p>;
  return (
    <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
      {items.map((i) => (
        <ActivityRow key={i.id} item={i} />
      ))}
    </div>
  );
}

export function OverviewPanel() {
  const activities = useSecurity((s) => s.activities);
  const honeypots = useSecurity((s) => s.honeypots);
  const settings = useSecurity((s) => s.settings);
  const connection = useSecurity((s) => s.connection);
  const scanning = useSecurity((s) => s.scanning);
  const lastScan = useSecurity((s) => s.lastScan);
  const runSecurityAnalysis = useSecurity((s) => s.runSecurityAnalysis);
  const indicators = useSecurity((s) => s.indicators);
  const allowlist = useSecurity((s) => s.allowlist);
  const scanLog = useSecurity((s) => s.scanLog);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const score = useScore();
  const tone = ScoreTone(score.status);
  const threats = activities.filter((a) => a.status === "suspicious");
  const review = activities.filter((a) => a.status === "unknown");
  const blocked = activities.filter((a) => a.status === "blocked" || a.status === "killed");
  const allowed = activities.filter((a) => a.status === "allowed");
  const dims = [
    {
      name: "Network Exposure",
      value: Math.max(12, 100 - threats.filter((t) => t.type === "traffic").length * 18),
      desc: threats.some((t) => t.type === "traffic")
        ? "Third-party or tracker hosts in this session"
        : "Only first-party traffic so far",
    },
    {
      name: "Runtime Integrity",
      value: Math.max(18, 100 - threats.filter((t) => t.type === "process").length * 22),
      desc: threats.some((t) => t.type === "process")
        ? "Service worker is not controlling this origin"
        : "UI thread and worker look healthy",
    },
    {
      name: "Transport",
      value: connection.secure ? 96 : 40,
      desc: connection.secure ? "HTTPS" : "HTTP — session can be read",
    },
    {
      name: "Decoy Grid",
      value: Math.round((honeypots.filter((h) => h.armed).length / Math.max(1, honeypots.length)) * 100),
      desc: `${honeypots.filter((h) => h.armed).length}/${honeypots.length} traps armed`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            icon={<ShieldCheck className={cn("size-4", tone.color)} />}
            title="Security Score"
            subtitle="Real-time posture assessment"
            iconClass={tone.bg}
          />
          <div className="flex items-center gap-4">
            <div className={cn("text-5xl font-bold tabular-nums", tone.color)}>{score.score}</div>
            <div>
              <div className={cn("text-lg font-bold", tone.color)}>Grade {score.grade}</div>
              <div className="text-xs text-muted">{score.label}</div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5 text-micro">
            <Row k="Confirmed findings" v={`${threats.length}`} tone="text-rose" />
            <Row k="Needs review" v={`${review.length}`} tone="text-amber" />
            <Row k="Items blocked" v={String(blocked.length)} tone="text-red" />
            <Row k="Known safe" v={String(allowed.length)} tone="text-emerald" />
          </div>
          {score.factors.length > 0 ? (
            <ul className="mt-3 space-y-1 text-micro text-muted">
              {score.factors.map((f) => (
                <li key={f.label} className="flex justify-between">
                  <span>{f.label}</span>
                  <span className="text-rose">−{f.deduction}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
        <Panel>
          <PanelHeader icon={<Brain className="size-4" />} title="Security Dimensions" subtitle="Live posture channels" />
          <div className="space-y-3">
            {dims.map((d) => (
              <div key={d.name}>
                <div className="mb-1 flex justify-between text-micro">
                  <span className="text-fg">{d.name}</span>
                  <span className="font-mono text-muted tabular-nums">{d.value}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-cyan" style={{ width: `${d.value}%` }} />
                </div>
                <p className="mt-1 text-2xs text-subtle">{d.desc}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel>
        <PanelHeader
          icon={<Radar className="size-4" />}
          title="Security Analysis Engine"
          subtitle="Rule-based posture analysis"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void runSecurityAnalysis()} disabled={scanning}>
            {scanning ? "Scanning..." : "Run Security Analysis"}
          </Button>
          {lastScan ? (
            <span className="text-micro text-subtle">Last scan {timeAgo(lastScan)}</span>
          ) : null}
        </div>
        <ScanFeed log={scanLog} scanning={scanning} />
        <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <MiniStat label="Behavioral profiles" value={allowed.length} />
          <MiniStat label="Threat indicators" value={indicators.length} />
          <MiniStat label="Trusted items" value={allowlist.length} />
          <MiniStat label="Threats neutralized" value={blocked.length} />
        </div>
        <p className="mt-3 text-micro text-muted">
          Always On {settings.alwaysOn ? "enabled" : "off"} · {honeypots.filter((h) => h.armed).length} decoys armed ·{" "}
          {connection.secure ? "Secure" : "Insecure"} link
          {killSwitch ? " · Network guard armed" : ""}
        </p>
      </Panel>
      <QuickActions />
    </div>
  );
}

function ScanFeed({
  log,
  scanning,
}: {
  log: { id: string; at: number; message: string; kind: "info" | "threat" | "ok" | "learn" }[];
  scanning: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const lines = [...log].reverse();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log, scanning]);
  return (
    <div
      ref={box}
      className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-2xs"
    >
      {lines.length === 0 && !scanning ? (
        <p className="py-4 text-center text-subtle">Tap Run Security Analysis — live engine output appears here.</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((e) => (
            <div key={e.id} className="flex gap-2">
              <StatusDot
                tone={
                  e.kind === "threat" ? "rose" : e.kind === "ok" ? "emerald" : e.kind === "learn" ? "cyan" : "muted"
                }
              />
              <span
                className={
                  e.kind === "threat"
                    ? "text-rose"
                    : e.kind === "ok"
                      ? "text-emerald"
                      : e.kind === "learn"
                        ? "text-cyan"
                        : "text-muted"
                }
              >
                {e.message}
              </span>
            </div>
          ))}
          {scanning ? <div className="text-cyan">▌ analyzing…</div> : null}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{k}</span>
      <span className={cn("tabular-nums", tone)}>{v}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-elevated p-2.5">
      <div className="text-lg font-bold text-fg tabular-nums">{value}</div>
      <div className="text-2xs text-subtle">{label}</div>
    </div>
  );
}

function QuickActions() {
  const resolveAllThreats = useSecurity((s) => s.resolveAllThreats);
  const clearResolved = useSecurity((s) => s.clearResolved);
  const refresh = useSecurity((s) => s.refresh);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const openItems = useSecurity(
    (s) => s.activities.filter((a) => a.status === "suspicious" || a.status === "unknown").length,
  );
  const resolved = useSecurity(
    (s) => s.activities.filter((a) => a.status === "blocked" || a.status === "killed" || a.status === "resolved").length,
  );
  const actions = [
    {
      key: "kill",
      label: killSwitch ? "Release Kill Switch" : "Arm Kill Switch",
      desc: killSwitch ? "Restore all dropped sessions" : "Cut every inbound and outbound socket",
      color: killSwitch
        ? "text-red border-red/40 bg-red-dim hover:bg-red/20"
        : "text-red border-red/20 bg-red-dim hover:bg-red/20",
      icon: killSwitch ? WifiOff : Wifi,
      onClick: () => {
        const arming = !killSwitch;
        toggleKillSwitch();
        if (arming) toast.error("Kill switch armed — third-party fetches from this app are blocked.");
        else toast.success("Kill switch released — third-party fetches allowed.");
      },
      disabled: false,
    },
    {
      key: "block",
      label: "Block Open Items",
      desc: `Block ${openItems} open item${openItems === 1 ? "" : "s"}`,
      color: "text-red border-red/20 bg-red-dim hover:bg-red/20",
      icon: ShieldAlert,
      onClick: resolveAllThreats,
      disabled: openItems === 0,
    },
    {
      key: "clear",
      label: "Clear Resolved",
      desc: `Remove ${resolved} resolved items`,
      color: "text-muted border-line bg-elevated hover:bg-white/10",
      icon: Trash2,
      onClick: clearResolved,
      disabled: resolved === 0,
    },
    {
      key: "refresh",
      label: "Refresh Data",
      desc: "Reload all monitors",
      color: "text-cyan border-cyan/20 bg-cyan-dim hover:bg-cyan/20",
      icon: RefreshCw,
      onClick: refresh,
      disabled: false,
    },
  ];
  return (
    <Panel>
      <PanelHeader
        icon={<Activity className="size-4" />}
        title="Quick Actions"
        subtitle="One-tap security operations"
        iconClass="bg-elevated text-muted"
      />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                a.color,
              )}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-white/5">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-fg">{a.label}</div>
                <div className="truncate text-2xs text-subtle">{a.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

export function AlertsPanel() {
  const activities = useSecurity((s) => s.activities);
  const runSecurityAnalysis = useSecurity((s) => s.runSecurityAnalysis);
  const scanning = useSecurity((s) => s.scanning);
  const resolveAllThreats = useSecurity((s) => s.resolveAllThreats);
  const scanLog = useSecurity((s) => s.scanLog);
  const suspicious = activities.filter((a) => a.status === "suspicious");
  const review = activities.filter((a) => a.status === "unknown");
  const open = [...suspicious, ...review];
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader icon={<Bell className="size-4" />} title="Threat Resolution" subtitle="Active items needing a decision" iconClass="bg-rose-dim text-rose" />
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="danger" onClick={resolveAllThreats} disabled={open.length === 0}>
            {scanning ? "Working..." : "Block Open Items"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void runSecurityAnalysis()} disabled={scanning}>
            Run Security Analysis
          </Button>
        </div>
        {open.length === 0 ? (
          <p className="py-8 text-center text-xs text-subtle">No tracker or unclassified app-session hosts need review.</p>
        ) : (
          <List items={open} empty="" />
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-2xs">
          <Badge tone="rose">Trackers {suspicious.length}</Badge>
          <Badge tone="amber">Review {review.length}</Badge>
        </div>
      </Panel>
      <Panel>
        <PanelHeader icon={<Brain className="size-4" />} title="Analysis Activity Feed" subtitle="Rule and telemetry output" />
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {scanLog.length === 0 ? (
            <p className="py-6 text-center text-xs text-subtle">No analysis events yet. Run a security analysis.</p>
          ) : (
            scanLog.map((e) => (
              <div key={e.id} className="flex gap-2 text-micro">
                <StatusDot
                  tone={e.kind === "threat" ? "rose" : e.kind === "ok" ? "emerald" : e.kind === "learn" ? "cyan" : "muted"}
                />
                <span className="text-muted">{e.message}</span>
                <span className="ml-auto shrink-0 font-mono text-2xs text-subtle">{timeAgo(e.at)}</span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

export function NetworkPanel() {
  const activities = useSecurity((s) => s.activities);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const droppedPackets = useSecurity((s) => s.droppedPackets);
  const linkKbps = useSecurity((s) => s.linkKbps);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const [filter, setFilter] = useState<"all" | "inbound" | "outbound" | "dropped">("all");
  const items = activities.filter((a) => {
    if (a.type !== "traffic") return false;
    if (filter === "dropped") return a.resolveNote === "Network kill switch" || a.status === "blocked";
    if (filter === "all") return true;
    return a.direction === filter;
  });
  const live = activities.filter((a) => a.type === "traffic" && a.status === "allowed").length;
  return (
    <Panel>
      <PanelHeader icon={<Network className="size-4" />} title="App Network Activity" subtitle="Requests observable from Kysmindset" />
      <div
        className={cn(
          "mb-4 grid grid-cols-3 gap-2 rounded-md border p-3",
          killSwitch ? "border-red/25 bg-red-dim/40" : "border-line bg-elevated",
        )}
      >
        <div>
          <div className={cn("text-lg font-bold tabular-nums", killSwitch ? "text-red" : "text-fg")}>
            {killSwitch ? "0" : linkKbps}
            <span className="ml-1 text-xs font-medium text-muted">KB/s</span>
          </div>
          <div className="text-2xs text-subtle">Throughput</div>
        </div>
        <div>
          <div className={cn("text-lg font-bold tabular-nums", killSwitch ? "text-red" : "text-emerald")}>
            {killSwitch ? 0 : live}
          </div>
          <div className="text-2xs text-subtle">Open sockets</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums text-red">{droppedPackets.toLocaleString()}</div>
          <div className="text-2xs text-subtle">Packets dropped</div>
        </div>
      </div>
      {killSwitch ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red/20 bg-red-dim px-3 py-2">
          <p className="text-xs text-red">
            Kill switch armed — Android VPN traffic is dropped when active; Kysmindset third-party requests are also blocked.
          </p>
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
      <div className="mb-3 flex gap-1.5">
        {(["all", "inbound", "outbound", "dropped"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs capitalize",
              filter === f ? "border-line-strong bg-white/10 text-fg" : "border-transparent text-muted hover:bg-white/5",
            )}
          >
            {f === "all" ? "Traffic" : f}
          </button>
        ))}
      </div>
      <List items={items} empty={killSwitch ? "Kill switch is armed — third-party fetches from this app are failed." : "No sockets from this app yet. Hosts this page talks to show up here."} />
    </Panel>
  );
}

export function SystemPanel() {
  const activities = useSecurity((s) => s.activities);
  const device = useSecurity((s) => s.devicePosture);
  const [kind, setKind] = useState<"app" | "process">("process");
  const items = activities.filter((a) => a.type === kind);
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<ShieldCheck className="size-4" />}
          title="Android Device Posture"
          subtitle={device ? `${device.manufacturer} ${device.model} · Android ${device.release}` : "Native signals appear in the APK"}
        />
        {device ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Security patch" value={device.securityPatch || "Unknown"} />
              <MiniStat label="Root signals" value={device.rootSignals ? "Detected" : "None seen"} />
              <MiniStat label="Screen lock" value={device.deviceSecure ? "Secure" : "Off"} />
              <MiniStat label="VPN kill" value={device.vpnActive ? "Active" : "Idle"} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-2xs">
              <Badge tone={device.debuggerAttached ? "rose" : "emerald"}>Debugger {device.debuggerAttached ? "attached" : "clear"}</Badge>
              <Badge tone={device.emulatorSignals ? "amber" : "muted"}>{device.emulatorSignals ? "Emulator signals" : "Physical-device signals"}</Badge>
              <Badge tone={device.deviceOwner ? "emerald" : device.deviceAdmin ? "amber" : "muted"}>
                {device.deviceOwner ? "Device owner" : device.deviceAdmin ? "Device admin" : "Standard app"}
              </Badge>
              <Badge tone={device.biometricAvailable ? "emerald" : "muted"}>Biometric {device.biometricAvailable ? "available" : "unavailable"}</Badge>
            </div>
            {device.rootEvidence.length ? (
              <p className="mt-2 break-all text-2xs text-rose">Root evidence: {device.rootEvidence.join(", ")}</p>
            ) : null}
            <p className="mt-2 text-2xs text-subtle">These are best-effort Android posture indicators, not a malware verdict.</p>
          </>
        ) : (
          <p className="py-5 text-center text-xs text-subtle">Browser/PWA mode cannot read Android root, patch, lock-screen, or debugger signals.</p>
        )}
      </Panel>
      <Panel>
        <PanelHeader
          icon={kind === "app" ? <Globe className="size-4" /> : <MemoryStick className="size-4" />}
          title={kind === "app" ? "Runtime Hints" : "Kysmindset Runtime"}
          subtitle="App-local browser/WebView telemetry — not a device process list"
        />
        <div className="mb-3 flex gap-1.5">
          {(["process", "app"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setKind(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs capitalize",
                kind === f ? "border-line-strong bg-white/10 text-fg" : "border-transparent text-muted hover:bg-white/5",
              )}
            >
              {f === "app" ? "Runtime" : "Kysmindset"}
            </button>
          ))}
        </div>
        <List items={items} empty={kind === "app" ? "No runtime hints yet." : "Kysmindset UI-thread and worker telemetry appears here."} />
      </Panel>
    </div>
  );
}

const DECOY_ICON: Record<DecoyType, typeof Terminal> = {
  ssh: Terminal,
  admin: Globe,
  credentials: FileWarning,
  mysql: Database,
  ftp: Server,
};

export function HoneypotPanel() {
  const honeypots = useSecurity((s) => s.honeypots);
  const intrusions = useSecurity((s) => s.intrusions);
  const indicators = useSecurity((s) => s.indicators);
  const toggle = useSecurity((s) => s.toggleHoneypot);
  const runPenTest = useSecurity((s) => s.runPenTest);
  const [busy, setBusy] = useState(false);
  const armed = honeypots.filter((h) => h.armed).length;
  const caught = intrusions.length;
  const learnedPaths = new Set(indicators.filter((i) => i.kind === "path").map((i) => i.value)).size;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<EyeOff className="size-4 text-amber" />}
          title="Honeypot Defense"
          subtitle="Decoy paths on this origin. A real probe (or Pen Test) is logged."
          iconClass="bg-amber-dim text-amber"
        />
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Armed" value={armed} />
          <MiniStat label="Probes" value={caught} />
          <MiniStat label="Logged paths" value={learnedPaths} />
        </div>
        <Button
          className="mt-3 w-full"
          variant="subtle"
          disabled={busy || armed === 0}
          onClick={() => {
            setBusy(true);
            runPenTest();
            window.setTimeout(() => setBusy(false), 900);
          }}
        >
          {busy ? "Running Penetration Test..." : "Run Penetration Test"}
        </Button>
      </Panel>
      <div>
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">Decoy Traps</h3>
        <div className="space-y-2">
          {honeypots.map((h) => {
            const Icon = DECOY_ICON[h.decoyType];
            return (
              <div
                key={h.id}
                className={cn(
                  "rounded-md border p-3 transition-opacity",
                  h.armed ? "border-amber/20 bg-amber-dim/40" : "border-line bg-surface opacity-60",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-sm", h.armed ? "bg-amber-dim text-amber" : "bg-elevated text-subtle")}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">{h.name}</span>
                      <Badge tone={h.armed ? "amber" : "muted"}>{h.armed ? "Armed" : "Off"}</Badge>
                      <Badge tone={h.severity === "critical" || h.severity === "high" ? "rose" : "muted"}>
                        {h.severity}
                      </Badge>
                    </div>
                    <p className="text-micro text-muted">{h.description}</p>
                    <p className="font-mono text-2xs text-subtle">{h.path}</p>
                  </div>
                  <Switch checked={h.armed} onCheckedChange={() => toggle(h.id)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Panel>
        <PanelHeader icon={<Siren className="size-4" />} title="Decoy Probe Log" subtitle="Requests to armed decoy paths" />
        {intrusions.length === 0 ? (
          <p className="py-6 text-center text-xs text-subtle">No decoy probes logged. Armed paths are ready to record requests.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {intrusions.map((i) => (
              <div key={i.id} className="rounded-md border border-line bg-elevated p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">{i.honeypotName}</span>
                  {i.autoBlocked ? <Badge tone="red">Auto-Blocked</Badge> : null}
                </div>
                <p className="mt-1 font-mono text-micro text-rose">{i.source}</p>
                <p className="text-micro text-muted">{i.payload}</p>
                <p className="mt-1 text-2xs text-subtle">{timeAgo(i.at)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function TimelinePanel() {
  const activities = useSecurity((s) => s.activities);
  const data = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const label = `${String((new Date().getHours() - (11 - i) + 24) % 24).padStart(2, "0")}:00`;
      return { t: label, allowed: 0, threats: 0, blocked: 0 };
    });
    for (const a of activities) {
      const idx = Math.min(11, Math.max(0, 11 - Math.floor((Date.now() - a.createdAt) / 3_600_000)));
      const b = buckets[idx]!;
      if (a.status === "allowed") b.allowed += 1;
      else if (a.status === "blocked" || a.status === "killed") b.blocked += 1;
      else b.threats += 1;
    }
    return buckets;
  }, [activities]);

  return (
    <Panel>
      <PanelHeader icon={<History className="size-4" />} title="Security Timeline" subtitle="24-hour activity breakdown" />
      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gAllowed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gThreat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb7185" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "#8b97ab", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#8b97ab", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "#0c1018",
                border: "1px solid rgb(255 255 255 / 0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey="allowed" stroke="#34d399" fill="url(#gAllowed)" strokeWidth={1.5} />
            <Area type="monotone" dataKey="threats" stroke="#fb7185" fill="url(#gThreat)" strokeWidth={1.5} />
            <Area type="monotone" dataKey="blocked" stroke="#f87171" fill="none" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function PosturePanel() {
  const deepScan = useSecurity((s) => s.deepScan);
  const deepScanning = useSecurity((s) => s.deepScanning);
  const runDeepScan = useSecurity((s) => s.runDeepScan);
  const indicators = useSecurity((s) => s.indicators);
  const score = useScore();
  const tone = ScoreTone(score.status);
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<Shield className="size-4" />}
          title="Posture Review"
          subtitle="Rule-based app + Android posture assessment"
        />
        <Button size="sm" onClick={runDeepScan} disabled={deepScanning}>
          {deepScanning ? "Reviewing..." : "Run Posture Review"}
        </Button>
        {deepScanning ? (
          <p className="mt-3 text-xs text-muted">Reviewing observable Android signals, app-session traffic, permissions, and runtime controls...</p>
        ) : null}
        {deepScan ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-fg">{deepScan.assessment}</p>
            <Block title="Vulnerabilities" items={deepScan.vulnerabilities.map((v) => `${v.name} · ${v.severity}`)} empty="None found" />
            <Block title="Recommendations" items={deepScan.recommendations.map((r) => `${r.action} (${r.priority})`)} empty="No actions" />
            <Block title="Strengths" items={deepScan.strengths} empty="—" />
          </div>
        ) : null}
      </Panel>
      <Panel>
        <PanelHeader icon={<Globe className="size-4" />} title="Observed Indicators" subtitle="Hosts and decoy paths recorded from app-session decisions" />
        {indicators.length === 0 ? (
          <p className="py-6 text-center text-xs text-subtle">
            No observed indicators have been recorded yet.
          </p>
        ) : (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {indicators.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-micro">
                <span className="truncate font-mono text-red">{i.value}</span>
                <span className="ml-2 shrink-0 text-subtle">{i.kind}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-2xs text-subtle">Recorded indicators ({indicators.length})</p>
      </Panel>
      <Panel>
        <div className={cn("text-5xl font-bold tabular-nums", tone.color)}>{score.score}</div>
        <div className={cn("text-sm font-semibold", tone.color)}>
          Grade {score.grade} · {score.label}
        </div>
      </Panel>
    </div>
  );
}

function Block({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>
      {items.length === 0 ? (
        <p className="text-micro text-subtle">{empty}</p>
      ) : (
        <ul className="space-y-1 text-micro text-fg">
          {items.map((it) => (
            <li key={it}>· {it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const history = useSecurity((s) => s.history);
  return (
    <Panel>
      <PanelHeader icon={<History className="size-4" />} title="Threat History" subtitle="Resolution log" />
      {history.length === 0 ? (
        <p className="py-8 text-center text-xs text-subtle">No history items found.</p>
      ) : (
        <div className="max-h-[500px] space-y-2 overflow-y-auto">
          {history.map((h) => (
            <div key={h.id} className="rounded-md border border-line bg-elevated px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-fg">{h.action}</span>
                <span className="font-mono text-2xs text-subtle">{timeAgo(h.at)}</span>
              </div>
              <p className="text-micro text-muted">
                {h.target} — {h.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const PERM_ICON: Record<string, typeof MapPin> = {
  loc: MapPin,
  cam: Camera,
  mic: Mic,
  push: Bell,
  "clip-r": Clipboard,
  "clip-w": Clipboard,
  persist: Database,
};

export function ConfigPanel() {
  const settings = useSecurity((s) => s.settings);
  const patch = useSecurity((s) => s.patchSettings);
  const allowlist = useSecurity((s) => s.allowlist);
  const addAllow = useSecurity((s) => s.addAllow);
  const removeAllow = useSecurity((s) => s.removeAllow);
  const permissions = useSecurity((s) => s.permissions);
  const setPermission = useSecurity((s) => s.setPermission);
  const connection = useSecurity((s) => s.connection);
  const setPin = useSecurity((s) => s.setPin);
  const [name, setName] = useState("");
  const [type, setType] = useState<ActivityType>("process");
  const [pin, setPinLocal] = useState("");
  const { standalone } = useInstallState();

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<Download className="size-4" />}
          title="Install as an app"
          subtitle={standalone ? "Running in standalone (home screen)" : "Add to home screen for lock screen, alerts, and full screen"}
        />
        {standalone ? (
          <p className="text-xs text-emerald">Kysmindset is installed on this device.</p>
        ) : (
          <InstallBar className="mb-0" />
        )}
      </Panel>
      <Panel>
        <PanelHeader icon={<Shield className="size-4" />} title="System Protection" subtitle="Visible-session, tamper & automation controls" />
        <div className="space-y-3">
          <ToggleRow
            title="Keep Awake"
            desc="Requests a wake lock while Kysmindset is visible; Android retains lifecycle control."
            checked={settings.alwaysOn}
            onChange={(v) => patch({ alwaysOn: v })}
          />
          <ToggleRow
            title="Tamper Protection"
            desc="Blocks stop/pause of this PWA’s runtime and records the cause. Hosts can still be ended."
            checked={settings.tamperProtection}
            onChange={(v) => patch({ tamperProtection: v })}
          />
          <TamperLog />
          <ToggleRow
            title="Auto-Lockdown"
            desc="Automatically block known tracker findings discovered during analysis"
            checked={settings.autoLockdown}
            onChange={(v) => patch({ autoLockdown: v })}
          />
          <ToggleRow
            title="Auto-Lock"
            desc="Lock when you leave the installed app (home-screen mode)"
            checked={settings.autoLock !== false}
            onChange={(v) => patch({ autoLock: v })}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium text-fg">Scheduled Auto-Scan</div>
          <p className="mb-2 text-xs text-muted">Runs the security posture analysis automatically</p>
          <div className="flex flex-wrap gap-1.5">
            {[0, 15, 30, 60, 180, 360].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patch({ autoScanMin: m })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  settings.autoScanMin === m
                    ? "border-cyan/40 bg-cyan-dim text-cyan"
                    : "border-line text-muted hover:bg-white/5",
                )}
              >
                {m === 0 ? "Off" : m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? "s" : ""}`}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon={<Wifi className="size-4" />} title="WiFi Security" subtitle="Link status" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-line bg-elevated p-2.5">
            <div className="text-xs text-subtle">Encryption</div>
            <div className={cn("text-sm font-semibold", connection.secure ? "text-emerald" : "text-amber")}>
              {connection.secure ? "Secure" : "HTTP"}
            </div>
          </div>
          <div className="rounded-md border border-line bg-elevated p-2.5">
            <div className="text-xs text-subtle">Connection</div>
            <div className="text-sm font-semibold text-fg">{connection.effectiveType}</div>
          </div>
          <div className="rounded-md border border-emerald/20 bg-emerald-dim/40 p-2.5">
            <div className="text-xs text-subtle">Data Saver</div>
            <div className="text-sm font-semibold text-emerald">
              {connection.saveData ? "ON" : "Off"}
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon={<KeyRound className="size-4" />} title="Background Allowlist" subtitle="Only these can run in background" iconClass="bg-emerald-dim text-emerald" />
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            addAllow({ name: name.trim(), type });
            setName("");
          }}
        >
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
            className="rounded-sm border border-line bg-elevated px-2 py-2 text-xs text-fg outline-none"
          >
            <option value="process">Process</option>
            <option value="app">App</option>
            <option value="traffic">Traffic</option>
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add to allowlist..."
            className="flex-1 rounded-sm border border-line bg-elevated px-3 py-2 text-xs text-fg outline-none placeholder:text-subtle focus:border-cyan/50"
          />
          <button type="submit" className="rounded-sm bg-cyan-dim px-3 py-2 text-cyan hover:bg-cyan/20">
            <Plus className="size-4" />
          </button>
        </form>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {allowlist.length === 0 ? (
            <p className="p-4 text-center text-xs text-subtle">No allowed items yet</p>
          ) : (
            allowlist.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-sm border border-line bg-elevated px-3 py-2">
                <div>
                  <div className="text-sm text-fg">{a.name}</div>
                  <div className="text-2xs uppercase text-subtle">{a.type}</div>
                </div>
                <button type="button" onClick={() => removeAllow(a.id)} className="p-2 text-muted hover:text-red">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon={<Lock className="size-4" />} title="App Permissions" subtitle="What this device has granted" />
        <div className="space-y-2">
          {permissions.map((p) => {
            const Icon = PERM_ICON[p.id] ?? Globe;
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2">
                <Icon className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg">{p.name}</div>
                  <div className="text-micro text-muted">{p.description}</div>
                </div>
                {p.risk === "high" && !p.granted ? null : p.granted && p.risk === "high" ? (
                  <Badge tone="rose">high</Badge>
                ) : null}
                <Switch
                  checked={p.granted}
                  onCheckedChange={(on) => {
                    void (async () => {
                      if (!on) {
                        setPermission(p.id, false);
                        return;
                      }
                      const r = await requestNative(p.id);
                      if (r.granted) {
                        setPermission(p.id, true);
                        toast.success(
                          r.mode === "device"
                            ? `${p.name} allowed on this device${r.detail ? ` · ${r.detail}` : ""}`
                            : `${p.name} enabled in Kysmindset`,
                        );
                      } else {
                        toast.error(`${p.name} was denied`);
                      }
                    })();
                  }}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon={<KeyRound className="size-4" />} title="Lock PIN" subtitle="Native salted verifier on Android; browser fallback is lower assurance" />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4,8}$/.test(pin)) return;
            void setPin(pin).then((ok) => {
              if (ok) {
                setPinLocal("");
                toast.success("PIN verifier updated");
              } else {
                toast.error("PIN update failed");
              }
            });
          }}
        >
          <input
            value={pin}
            onChange={(e) => setPinLocal(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            className="w-28 rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-sm tracking-[0.4em] text-fg outline-none"
          />
          <Button size="sm" type="submit" disabled={!/^\d{4,8}$/.test(pin)}>
            Save PIN
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-elevated p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{title}</span>
          {checked ? <Badge tone="emerald">Active</Badge> : <Badge>Off</Badge>}
        </div>
        <p className="text-micro text-muted">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TamperLog() {
  const events = useSecurity((s) => s.tamperLog) ?? [];
  if (events.length === 0) {
    return (
      <p className="px-1 text-micro text-subtle">
        No tamper events yet. Ending Kysmindset or the Service Worker is blocked while this is
        on. Lost service-worker control is logged as the cause.
      </p>
    );
  }
  return (
    <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-line bg-elevated p-2">
      {events.slice(0, 8).map((e) => (
        <div key={e.id} className="flex gap-2 text-micro">
          <span className={e.actor === "intruder" ? "text-rose" : "text-amber"}>
            {e.actor === "intruder" ? "Intruder" : "You"}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted">{e.cause}</span>
          <span className="shrink-0 font-mono text-2xs text-subtle">{timeAgo(e.at)}</span>
        </div>
      ))}
    </div>
  );
}
