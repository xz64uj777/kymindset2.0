import { EyeOff, Lock, Shield, Siren, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { BgField, ScoreTone, StatusDot } from "./chrome";
import { SosDialog } from "./dialogs";
import { PinPad } from "./pin-pad";
import { lastGeoLabel, requestWakeLock, verifyBiometric, vibrate } from "@/lib/native";
import { useScore, useSecurity } from "@/lib/security/store";
import { cn, timeAgo } from "@/lib/utils";

const TYPE_LABEL = {
  traffic: "Net",
  app: "App",
  process: "Proc",
} as const;

export function LockScreen() {
  const activities = useSecurity((s) => s.activities);
  const unlock = useSecurity((s) => s.unlock);
  const settings = useSecurity((s) => s.settings);
  const liveTick = useSecurity((s) => s.liveTick);
  const connection = useSecurity((s) => s.connection);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const lockdown = useSecurity((s) => s.lockdown);
  const lastScan = useSecurity((s) => s.lastScan);
  const linkKbps = useSecurity((s) => s.linkKbps);
  const droppedPackets = useSecurity((s) => s.droppedPackets);
  const honeypots = useSecurity((s) => s.honeypots);
  const intrusions = useSecurity((s) => s.intrusions);
  const score = useScore();
  const tone = ScoreTone(score.status);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [sos, setSos] = useState(false);
  const [geo, setGeo] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => liveTick(), 2000);
    return () => window.clearInterval(id);
  }, [liveTick]);

  useEffect(() => {
    setGeo(lastGeoLabel());
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
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (e: string, fn: () => void) => void;
        removeEventListener: (e: string, fn: () => void) => void;
      }>;
    };
    if (!nav.getBattery) return;
    let bat: Awaited<ReturnType<NonNullable<typeof nav.getBattery>>> | null = null;
    const sync = () => {
      if (!bat) return;
      setBattery(Math.round(bat.level * 100));
      setCharging(bat.charging);
    };
    void nav.getBattery().then((b) => {
      bat = b;
      sync();
      b.addEventListener("levelchange", sync);
      b.addEventListener("chargingchange", sync);
    });
    return () => {
      bat?.removeEventListener("levelchange", sync);
      bat?.removeEventListener("chargingchange", sync);
    };
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const blink = now.getSeconds() % 2 === 1;
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const onSubmit = async (pin: string) => {
    if (pin === "__bio__") {
      await unlock("__bio__");
      return;
    }
    if (!(await unlock(pin))) {
      vibrate([40, 50, 40]);
      setError("Incorrect PIN");
      setShake(true);
      window.setTimeout(() => {
        setShake(false);
        setError("");
      }, 1000);
    }
  };

  const onBio = async () => {
    const r = await verifyBiometric();
    if (r === "ok") return true;
    vibrate([40, 50, 40]);
    setError(r === "unavailable" ? "Set up fingerprint or face unlock first" : "Biometric failed");
    window.setTimeout(() => setError(""), 1400);
    return false;
  };

  const threats = activities.filter((a) => a.status === "suspicious");
  const blocked = activities.filter((a) => a.status === "blocked" || a.status === "killed");
  const armed = honeypots.filter((h) => h.armed).length;
  const notes = threats.slice(0, 2);
  const latestCatch = intrusions[0];
  const linkLabel = connection.effectiveType === "UNKNOWN" ? "Link" : connection.effectiveType;

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-safe pb-safe">
      <BgField />
      <header className="relative z-10 flex items-center justify-between pt-1 text-2xs text-subtle">
        <span className="flex items-center gap-1.5 font-medium tracking-wide text-muted">
          <Shield className="size-3 text-cyan" />
          Kysmindset
        </span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          {killSwitch ? (
            <span className="flex items-center gap-1 text-red">
              <WifiOff className="size-3" />
              Guarded
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Wifi className="size-3" />
              {linkLabel}
            </span>
          )}
          <span className={connection.secure && !killSwitch ? "text-emerald" : "text-amber"}>
            {killSwitch ? "Network guard" : connection.secure ? "TLS" : "Open"}
          </span>
          {battery != null ? (
            <span>
              {battery}%{charging ? "+" : ""}
            </span>
          ) : null}
        </span>
      </header>

      <div className="relative z-10 mt-5 text-center sm:mt-12">
        <div className="lock-in text-7xl font-extralight tracking-tighter text-fg tabular-nums sm:text-8xl">
          {hh}
          <span className={cn("px-0.5", blink && "opacity-25")}>:</span>
          {mm}
        </div>
        <div className="lock-in mt-2 text-sm text-muted" style={{ animationDelay: "80ms" }}>
          {ampm} · {date}
        </div>
        {geo ? <div className="mt-1 font-mono text-2xs text-subtle">{geo}</div> : null}

        <div
          className={cn(
            "lock-in mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5",
            tone.bg,
          )}
          style={{ animationDelay: "140ms" }}
        >
          <StatusDot
            tone={score.status === "excellent" ? "emerald" : score.status === "critical" ? "red" : "amber"}
          />
          <span className={cn("text-sm font-semibold tabular-nums", tone.color)}>{score.score}</span>
          <span className="text-xs text-muted">
            Grade {score.grade} · {score.label}
          </span>
        </div>

        <div
          className="lock-in mx-auto mt-3 grid w-full max-w-sm grid-cols-3 gap-1.5"
          style={{ animationDelay: "180ms" }}
        >
          <MiniStat label="Alerts" value={threats.length} hot={threats.length > 0} />
          <MiniStat label="Blocked" value={blocked.length} />
          <MiniStat label="Decoys" value={armed} />
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-4 w-full max-w-sm space-y-2">
        {killSwitch ? (
          <LockCard
            delay={200}
            tone="red"
            kicker="Kill switch"
            title="Network guard armed"
            detail={`${droppedPackets.toLocaleString()} app requests dropped · device VPN status shown in dashboard`}
          />
        ) : null}
        {lockdown ? (
          <LockCard
            delay={220}
            tone="amber"
            kicker="Lockdown"
            title="Device locked down"
            detail="Unknown traffic and processes are blocked"
          />
        ) : null}
        {latestCatch ? (
          <LockCard
            delay={240}
            tone="cyan"
            kicker="Honeypot"
            title={latestCatch.honeypotName}
            detail={`${latestCatch.source} · ${latestCatch.payload}`}
            icon
          />
        ) : null}
        {notes.length === 0 && !killSwitch && !lockdown && !latestCatch ? (
          <LockCard
            delay={200}
            tone="muted"
            kicker="Monitor"
            title="All clear"
            detail={`Watching this origin’s requests and runtime · ${linkKbps} KB/s`}
          />
        ) : (
          notes.map((n, i) => {
            const port = n.destinationPort ?? n.sourcePort;
            const where = n.source
              ? `from ${n.source}`
              : n.destination
                ? `${n.destination}${port ? `:${port}` : ""}`
                : n.details;
            return (
              <div
                key={n.id}
                className="lock-in rounded-xl border border-line bg-surface/85 px-4 py-2.5 backdrop-blur-sm"
                style={{ animationDelay: `${260 + i * 70}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      n.status === "unknown" ? "bg-amber" : "bg-rose",
                    )}
                  />
                  <span className="truncate text-sm font-medium text-fg">{n.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-2xs uppercase text-subtle">
                    {TYPE_LABEL[n.type]}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 pl-3.5 text-micro text-muted">
                  {n.status} · {where} · {timeAgo(n.createdAt)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="relative z-10 mt-auto flex flex-col items-center gap-2.5 pb-2 pt-4">
        <p className="text-center font-mono text-2xs text-subtle">
          {killSwitch ? "App network guard · 0 KB/s" : `Live · ${linkKbps} KB/s`}
          {" · "}
          {lastScan ? `Scan ${timeAgo(lastScan)}` : "No scan yet"}
          {" · "}
          {settings.alwaysOn ? "Always on" : "Idle"}
          {settings.tamperProtection ? " · Tamper" : ""}
        </p>
        <div className="flex items-center gap-2 text-muted">
          <Lock className="size-3.5" />
          <span className="text-xs">Enter PIN or use biometrics</span>
        </div>
        <PinPad onSubmit={onSubmit} onBio={onBio} error={error} shake={shake} compact />
        <button
          type="button"
          onClick={() => {
            vibrate(20);
            setSos(true);
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-red/80 hover:text-red"
        >
          <Siren className="size-3.5" />
          Emergency
        </button>
      </div>
      <SosDialog open={sos} onOpenChange={setSos} />
    </div>
  );
}

function MiniStat({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface/70 px-2 py-1">
      <div className={cn("text-sm font-semibold tabular-nums", hot ? "text-rose" : "text-fg")}>{value}</div>
      <div className="text-2xs text-subtle">{label}</div>
    </div>
  );
}

function LockCard({
  delay,
  tone,
  kicker,
  title,
  detail,
  icon,
}: {
  delay: number;
  tone: "red" | "amber" | "cyan" | "muted";
  kicker: string;
  title: string;
  detail: string;
  icon?: boolean;
}) {
  const kickerClass =
    tone === "red"
      ? "text-red"
      : tone === "amber"
        ? "text-amber"
        : tone === "cyan"
          ? "text-cyan"
          : "text-subtle";
  const borderClass =
    tone === "red"
      ? "border-red/25 bg-red-dim/50"
      : tone === "amber"
        ? "border-amber/25 bg-amber-dim/50"
        : tone === "cyan"
          ? "border-cyan/20 bg-cyan-dim/40"
          : "border-line bg-surface/80";
  return (
    <div
      className={cn("lock-in rounded-xl border px-4 py-2.5 backdrop-blur-sm", borderClass)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide", kickerClass)}>
        {icon ? <EyeOff className="size-3" /> : null}
        {kicker}
      </div>
      <p className="mt-0.5 text-sm font-medium text-fg">{title}</p>
      <p className="line-clamp-1 text-micro text-muted">{detail}</p>
    </div>
  );
}
