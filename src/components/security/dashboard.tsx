import {
  LayoutGrid,
  Lock,
  Network,
  Power,
  Radar,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import type { IntelSection, TabId } from "@/lib/security/types";
import { useSecurity } from "@/lib/security/store";
import { isStandalone, requestWakeLock, setAppBadge } from "@/lib/native";
import { cn, timeAgo } from "@/lib/utils";
import { BgField, StatusDot } from "./chrome";
import { DecisionDialog, SosDialog } from "./dialogs";
import { InstallBar } from "./install-bar";
import { NetworkPanel } from "./network-panel";
import { ActionLegend } from "./activity-row";
import { ConfigScreen } from "./config-screen";
import { IntelPanel } from "./intel-panel";
import { OverviewPanel } from "./overview-panel";

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "network", label: "Network", icon: Network },
  { id: "system", label: "System", icon: Radar },
  { id: "config", label: "Config", icon: Settings },
];

const SYSTEM_FROM: Partial<Record<TabId, IntelSection>> = {
  intel: "runtime",
  timeline: "timeline",
  posture: "posture",
  history: "history",
  honeypot: "honeypot",
};

export function Dashboard() {
  const tab = useSecurity((s) => s.tab);
  const setTab = useSecurity((s) => s.setTab);
  const lock = useSecurity((s) => s.lock);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const droppedPackets = useSecurity((s) => s.droppedPackets);
  const linkKbps = useSecurity((s) => s.linkKbps);
  const lockdown = useSecurity((s) => s.lockdown);
  const toggleLockdown = useSecurity((s) => s.toggleLockdown);
  const lastTamper = useSecurity((s) => s.lastTamper);
  const connection = useSecurity((s) => s.connection);
  const activities = useSecurity((s) => s.activities);
  const liveTick = useSecurity((s) => s.liveTick);
  const settings = useSecurity((s) => s.settings);
  const runSecurityAnalysis = useSecurity((s) => s.runSecurityAnalysis);
  const [sos, setSos] = useState(false);

  const confirmedFindings = activities.filter((a) => a.status === "suspicious");

  useEffect(() => {
    const id = window.setInterval(() => liveTick(), 2000);
    return () => window.clearInterval(id);
  }, [liveTick]);

  useEffect(() => {
    if (!settings.autoScanMin) return;
    const id = window.setInterval(() => void runSecurityAnalysis(), settings.autoScanMin * 60_000);
    return () => window.clearInterval(id);
  }, [settings.autoScanMin, runSecurityAnalysis]);

  useEffect(() => {
    if (!settings.alwaysOn) return;
    let sent: WakeLockSentinel | null = null;
    void requestWakeLock().then((s) => {
      sent = s;
    });
    return () => {
      void sent?.release();
    };
  }, [settings.alwaysOn]);

  useEffect(() => {
    if (settings.autoLock === false) return;
    const onVis = () => {
      if (document.visibilityState === "hidden" && isStandalone()) lock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [settings.autoLock, lock]);

  useEffect(() => {
    setAppBadge(confirmedFindings.length);
  }, [confirmedFindings.length]);

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      <BgField />
      <Toaster theme="dark" position="top-center" />
      <DecisionDialog />
      <SosDialog open={sos} onOpenChange={setSos} />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 pt-safe pb-safe">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border border-cyan/20 bg-cyan-dim">
              <ShieldCheck className="size-5 text-cyan" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Security Center</h1>
              <div className="flex items-center gap-2 text-2xs text-subtle">
                {killSwitch ? (
                  <span className="flex items-center gap-1 font-medium text-red">
                    <WifiOff className="size-2.5" />
                    OFFLINE · 0 KB/s
                  </span>
                ) : (
                  <>
                    {connection.effectiveType !== "UNKNOWN" ? (
                      <span className="flex items-center gap-1">
                        <Wifi className="size-2.5" />
                        {connection.effectiveType}
                      </span>
                    ) : null}
                    <span className="font-mono tabular-nums">{linkKbps} KB/s</span>
                    <span className={cn("flex items-center gap-1", connection.secure ? "text-emerald" : "text-amber")}>
                      <StatusDot tone={connection.secure ? "emerald" : "amber"} className="size-1.5" />
                      {connection.secure ? "Secure" : "Insecure"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Network Kill Switch"
              aria-pressed={killSwitch}
              onClick={() => {
                const arming = !killSwitch;
                toggleKillSwitch();
                if (arming) {
                  toast.error("Kill switch requested — Android VPN blocks captured traffic when approved; Kysmindset third-party requests are blocked.");
                } else {
                  toast.success("Kill switch released — third-party fetches allowed.");
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-sm font-medium transition-colors",
                killSwitch
                  ? "kill-pulse border-red/50 bg-red-dim text-red"
                  : "border-line bg-elevated text-muted hover:bg-white/10 hover:text-fg",
              )}
            >
              {killSwitch ? <WifiOff className="size-4" /> : <Wifi className="size-4" />}
              <span>{killSwitch ? "Armed" : "Kill"}</span>
            </button>
            <button
              type="button"
              title="Emergency Lockdown"
              aria-pressed={lockdown}
              onClick={() => {
                const arming = !lockdown;
                toggleLockdown();
                if (arming) toast.error("App lockdown armed — unclassified third-party Kysmindset requests are blocked.");
                else toast.success("App lockdown lifted.");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                lockdown
                  ? "kill-pulse border-red/50 bg-red-dim text-red"
                  : "border-line bg-elevated text-muted hover:bg-white/10 hover:text-fg",
              )}
            >
              <Power className="size-4" />
              <span className="hidden sm:inline">{lockdown ? "Locked" : "Lockdown"}</span>
            </button>
            <button
              type="button"
              title="Lock"
              onClick={lock}
              className="flex items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2 text-sm text-muted transition-colors hover:bg-white/10 hover:text-fg"
            >
              <Lock className="size-4" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </header>

        <nav className="sticky top-0 z-30 -mx-4 mb-4 border-b border-cyan/15 bg-bg/95 px-4 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id || (t.id === "system" && SYSTEM_FROM[tab]);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-cyan-dim text-cyan ring-1 ring-cyan/40"
                      : "text-muted hover:bg-white/5 hover:text-fg",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        <InstallBar />

        {killSwitch ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red/30 bg-red-dim px-3 py-3">
            <div className="flex min-w-0 items-start gap-2">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-red" />
              <div>
                <p className="text-sm font-semibold text-red">Network guard armed</p>
                <p className="text-xs text-red/80">
                  Kysmindset third-party requests are blocked; the Android VPN also drops captured device traffic when active. {droppedPackets.toLocaleString()} app requests dropped · 0 KB/s
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                toggleKillSwitch();
                toast.success("Kill switch released — third-party fetches allowed.");
              }}
              className="shrink-0 rounded-md border border-red/40 bg-elevated px-3 py-1.5 text-xs font-medium text-fg hover:bg-white/10"
            >
              Release
            </button>
          </div>
        ) : null}

        {lockdown ? (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-amber/20 bg-amber-dim px-3 py-2">
            <p className="text-xs text-amber">
              APP LOCKDOWN — unclassified third-party requests from Kysmindset are blocked until reviewed.
            </p>
            <button type="button" onClick={() => setSos(true)} className="shrink-0 text-xs font-medium text-red">
              SOS Alert
            </button>
          </div>
        ) : null}

        {lastTamper ? (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber/20 bg-amber-dim px-3 py-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber">
                Tamper protection blocked {lastTamper.actor === "intruder" ? "an intrusion" : "your action"}
              </p>
              <p className="text-micro text-muted">
                {lastTamper.cause} · {timeAgo(lastTamper.at)}
              </p>
            </div>
          </div>
        ) : null}

        {tab === "network" ? (
          <div className="mb-3">
            <ActionLegend />
          </div>
        ) : null}

        {tab === "overview" && <OverviewPanel />}
        {tab === "network" && <NetworkPanel />}
        {(tab === "system" || SYSTEM_FROM[tab]) && <IntelPanel initial={SYSTEM_FROM[tab] ?? "runtime"} />}
        {tab === "config" && <ConfigScreen />}
      </div>
    </div>
  );
}
