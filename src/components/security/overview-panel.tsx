import { Activity, Radar, RefreshCw, ShieldAlert, ShieldCheck, Terminal, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isDeviceVpnActive } from "@/lib/native";
import { useScore, useSecurity } from "@/lib/security/store";
import { cn, timeAgo } from "@/lib/utils";
import { Panel, PanelHeader, ScoreTone, StatusDot } from "./chrome";
import { ActivityRow } from "./activity-row";

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
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const deepScan = useSecurity((s) => s.deepScan);
  const deepScanning = useSecurity((s) => s.deepScanning);
  const runDeepScan = useSecurity((s) => s.runDeepScan);
  const autoFixScan = useSecurity((s) => s.autoFixScan);
  const setTab = useSecurity((s) => s.setTab);
  const score = useScore();
  const tone = ScoreTone(score.status);
  const [deviceVpn, setDeviceVpn] = useState<boolean | null>(() => isDeviceVpnActive());
  useEffect(() => {
    const sync = () => setDeviceVpn(isDeviceVpnActive());
    sync();
    const id = window.setInterval(sync, 1500);
    return () => window.clearInterval(id);
  }, [killSwitch]);
  const threats = activities.filter((a) => a.status === "suspicious");
  const reviewItems = activities.filter((a) => a.status === "unknown");
  const openItems = [...threats, ...reviewItems];
  const blocked = activities.filter((a) => a.status === "blocked" || a.status === "killed");
  const allowed = activities.filter((a) => a.status === "allowed");
  const autoFixable =
    threats.filter((a) => a.type === "traffic").length +
    honeypots.filter((h) => !h.armed).length +
    Number(!settings.tamperProtection);
  const weakenedCount = deepScan?.vulnerabilities.length ?? 0;
  const scanHeadline = threats.length
    ? "Alerts found"
    : reviewItems.length || weakenedCount
      ? "Protection weakened"
      : "No action needed";
  const dims = [
    {
      name: "Network Exposure",
      value: Math.max(12, 100 - threats.filter((t) => t.type === "traffic").length * 18),
      desc: threats.some((t) => t.type === "traffic")
        ? "Known tracker findings in this app session"
        : "No known tracker findings in this app session",
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

  const scrollToPanel = (title: string) => {
    const sections = Array.from(document.querySelectorAll("section"));
    const target = sections.find((section) => section.querySelector("h3")?.textContent?.trim() === title);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copySnapshot = async () => {
    const text = [
      `Kysmindset ${score.grade} ${score.score} · ${score.label}`,
      `Link ${connection.secure ? "HTTPS" : "HTTP"} · ${connection.effectiveType}`,
      killSwitch ? "Kill switch armed" : "Kill switch idle",
      `Decoys ${honeypots.filter((h) => h.armed).length}/${honeypots.length}`,
      lastScan ? `Last scan ${new Date(lastScan).toISOString()}` : "No scan yet",
      score.factors.map((f) => `- ${f.label} (−${f.deduction})`).join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Posture snapshot copied");
    } catch {
      toast.message(text);
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader icon={<ShieldCheck className="size-4" />} title="Protection state" subtitle="Authoritative layers, separated by source" />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-elevated p-3">
            <div className="text-2xs uppercase tracking-wide text-subtle">Android · Device VPN</div>
            <div className={cn("mt-1 text-sm font-semibold", deviceVpn === true ? "text-emerald" : deviceVpn === false ? "text-amber" : "text-muted")}>
              {deviceVpn === true ? "Active" : deviceVpn === false ? "Inactive" : "Unavailable in this runtime"}
            </div>
          </div>
          <div className="rounded-md border border-line bg-elevated p-3">
            <div className="text-2xs uppercase tracking-wide text-subtle">App · Network guard</div>
            <div className={cn("mt-1 text-sm font-semibold", killSwitch ? "text-emerald" : "text-muted")}>
              {killSwitch ? "Active" : "Inactive"}
            </div>
          </div>
          <div className="rounded-md border border-line bg-elevated p-3">
            <div className="text-2xs uppercase tracking-wide text-subtle">VPN · Allowed apps</div>
            <div className="mt-1 text-sm font-semibold text-fg">{allowlist.length} trusted entries</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={toggleKillSwitch}>
            {killSwitch ? "Stop Protection" : "Start Protection"}
          </Button>
          <span className="text-2xs text-subtle">
            {killSwitch
              ? "App Network Guard is armed. Android VPN status above confirms the device tunnel."
              : "Starts the app network guard and requests Android VPN protection. Android may show a VPN permission prompt."}
          </span>
        </div>
        <p className="mt-2 text-2xs text-subtle">
          Device VPN status comes from the Android bridge. Browser/runtime telemetry below is app-only unless explicitly labeled Android or VPN.
        </p>
      </Panel>
      <Panel>
        <PanelHeader icon={<Radar className="size-4" />} title="Security Scan" subtitle="Scan first; decide from one result screen" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              void runSecurityAnalysis().then(() => {
                runDeepScan();
                window.setTimeout(() => scrollToPanel("Scan Results"), 100);
              });
            }}
            disabled={scanning || deepScanning}
          >
            {scanning ? "Scanning..." : "Run Security Scan"}
          </Button>
          {lastScan ? <span className="text-micro text-subtle">Last scan {timeAgo(lastScan)}</span> : null}
        </div>
        <p className="mt-3 text-micro text-muted">
          Always On {settings.alwaysOn ? "on" : "off"} · {honeypots.filter((h) => h.armed).length} decoys ·{" "}
          {connection.secure ? "Secure" : "Insecure"} link
          {killSwitch ? " · Network guard" : ""} · {allowlist.length} trusted · {indicators.length} learned indicators
        </p>
      </Panel>
      {lastScan ? (
        <Panel>
          <PanelHeader
            icon={<ShieldAlert className="size-4" />}
            title="Scan Results"
            subtitle="Everything that needs a decision stays here"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Status</div>
              <div className={cn("mt-1 text-sm font-semibold", threats.length ? "text-rose" : reviewItems.length || weakenedCount ? "text-amber" : "text-emerald")}>
                {scanHeadline}
              </div>
            </div>
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Alerts</div>
              <div className={cn("mt-1 text-sm font-semibold", threats.length ? "text-rose" : "text-emerald")}>{threats.length}</div>
            </div>
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Needs review / weakened</div>
              <div className={cn("mt-1 text-sm font-semibold", reviewItems.length || weakenedCount ? "text-amber" : "text-emerald")}>
                {reviewItems.length + weakenedCount}
              </div>
            </div>
          </div>

          {deepScanning ? <p className="mt-3 text-xs text-muted">Building the final posture summary…</p> : null}

          {openItems.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-fg">Alerts & review items</div>
              {openItems.slice(0, 4).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
              {openItems.length > 4 ? (
                <button type="button" onClick={() => setTab("network")} className="text-xs font-medium text-cyan hover:underline">
                  Review all {openItems.length} manually →
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-emerald/20 bg-emerald-dim/30 px-3 py-2 text-xs text-emerald">
              No open network findings need a decision.
            </p>
          )}

          {deepScan?.vulnerabilities.length ? (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-fg">Weakened areas</div>
              <div className="space-y-1.5">
                {deepScan.vulnerabilities.slice(0, 5).map((v) => (
                  <div key={`${v.name}-${v.severity}`} className="flex items-start justify-between gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-xs">
                    <span className="text-muted">{v.name}</span>
                    <span className="shrink-0 uppercase text-2xs text-amber">{v.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={autoFixable === 0}
              onClick={() => {
                const result = autoFixScan();
                runDeepScan();
                if (result.fixed) {
                  toast.success(`Auto Fix corrected ${result.fixed} safe item${result.fixed === 1 ? "" : "s"}.${result.manual ? ` ${result.manual} still need manual review.` : ""}`);
                } else {
                  toast.message("No safe automatic fixes are available for the remaining items.");
                }
              }}
            >
              Auto Fix{autoFixable ? ` (${autoFixable})` : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTab("network")} disabled={openItems.length === 0}>
              Review all manually
            </Button>
          </div>
          <p className="mt-2 text-2xs text-subtle">
            Auto Fix only changes reversible Kymindset-owned controls and blocks confirmed tracker findings. Unknown hosts, Android settings, root/debugger signals, and emergency lockdown remain manual.
          </p>
        </Panel>
      ) : null}
      <Panel>
        <PanelHeader icon={<Terminal className="size-4" />} title="Live feed" subtitle="Engine output while a scan runs" />
        <ScanFeed log={scanLog} scanning={scanning} />
      </Panel>
      <QuickActions />
      <Panel>
        <PanelHeader
          icon={<ShieldCheck className={cn("size-4", tone.color)} />}
          title="Security Score"
          subtitle="Observable app + Android posture"
          iconClass={tone.bg}
        />
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className={cn("text-5xl font-bold tabular-nums", tone.color)}>{score.score}</div>
            <div>
              <div className={cn("text-lg font-bold", tone.color)}>Grade {score.grade}</div>
              <div className="text-xs text-muted">{score.label}</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void copySnapshot()}>
            Copy snapshot
          </Button>
        </div>
        {score.factors.length > 0 ? (
          <ul className="mt-3 space-y-1 text-micro text-muted">
            {score.factors.map((f) => (
              <li key={f.label} className="flex justify-between">
                <span>{f.label}</span>
                <span className="text-rose">-{f.deduction}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 space-y-3">
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
        <p className="mt-3 text-2xs text-subtle">
          {allowed.length} known safe · {blocked.length} cut this session
        </p>
      </Panel>
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
  const lines = Array.isArray(log) ? [...log].reverse() : [];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log, scanning]);
  return (
    <div ref={box} className="max-h-72 overflow-y-auto rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-2xs">
      {lines.length === 0 && !scanning ? (
        <p className="py-6 text-center text-subtle">Tap Run Security Analysis — live engine output appears here.</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((e) => (
            <div key={e.id} className="flex gap-2">
              <StatusDot
                tone={e.kind === "threat" ? "rose" : e.kind === "ok" ? "emerald" : e.kind === "learn" ? "cyan" : "muted"}
              />
              <span
                className={
                  e.kind === "threat" ? "text-rose" : e.kind === "ok" ? "text-emerald" : e.kind === "learn" ? "text-cyan" : "text-muted"
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

function QuickActions() {
  const resolveAllThreats = useSecurity((s) => s.resolveAllThreats);
  const clearResolved = useSecurity((s) => s.clearResolved);
  const refresh = useSecurity((s) => s.refresh);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const setTab = useSecurity((s) => s.setTab);
  const activities = useSecurity((s) => s.activities);
  const pending = activities.filter((a) => a.status === "suspicious" || a.status === "unknown");
  const threats = activities.filter((a) => a.status === "suspicious");
  const resolved = activities.filter(
    (a) => a.status === "blocked" || a.status === "killed" || a.status === "resolved",
  ).length;
  const actions = [
    {
      key: "kill",
      label: killSwitch ? "Release Kill Switch" : "Arm Kill Switch",
      desc: killSwitch ? "Release Android/app traffic guard" : "Arm Android VPN + app request guard",
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
      label: "Block confirmed findings",
      desc: threats.length ? "Block confirmed suspicious items" : "No confirmed findings",
      color: "text-red border-red/20 bg-red-dim hover:bg-red/20",
      icon: ShieldAlert,
      onClick: resolveAllThreats,
      disabled: threats.length === 0,
    },
    {
      key: "clear",
      label: "Clear resolved",
      desc: resolved ? "Remove finished rows" : "Board already clean",
      color: "text-muted border-line bg-elevated hover:bg-white/10",
      icon: Trash2,
      onClick: clearResolved,
      disabled: resolved === 0,
    },
    {
      key: "refresh",
      label: "Refresh",
      desc: "Reload monitors",
      color: "text-cyan border-cyan/20 bg-cyan-dim hover:bg-cyan/20",
      icon: RefreshCw,
      onClick: refresh,
      disabled: false,
    },
  ];
  return (
    <Panel>
      <PanelHeader icon={<Activity className="size-4" />} title="Actions" subtitle="One-tap operations" iconClass="bg-elevated text-muted" />
      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => setTab("network")}
          className="mb-3 w-full rounded-md border border-rose/25 bg-rose-dim/40 px-3 py-2 text-left text-xs text-rose"
        >
          Open items are on Network — tap to review hosts
        </button>
      ) : null}
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
