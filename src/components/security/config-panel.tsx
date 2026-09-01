import {
  Bell,
  Camera,
  Clipboard,
  Database,
  Download,
  Globe,
  KeyRound,
  Lock,
  MapPin,
  Mic,
  Shield,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { requestNative } from "@/lib/native";
import { useSecurity } from "@/lib/security/store";
import { cn, timeAgo } from "@/lib/utils";
import { Panel, PanelHeader } from "./chrome";
import { InstallBar, useInstallState } from "./install-bar";

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
  const permissions = useSecurity((s) => s.permissions);
  const setPermission = useSecurity((s) => s.setPermission);
  const connection = useSecurity((s) => s.connection);
  const setPin = useSecurity((s) => s.setPin);
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
        <PanelHeader icon={<Shield className="size-4" />} title="Runtime Controls" subtitle="Visible-session, tamper, automation & lock behavior" />
        <div className="space-y-3">
          <ToggleRow
            title="Keep Awake"
            desc="Requests a screen wake lock while Kysmindset is visible. Android can still suspend or stop the app."
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
          <ToggleRow
            title="Device lock screen"
            desc="On the APK, wake Kysmindset over the keyguard when the screen turns on. Needs Device Owner for a real replacement of the system lock."
            checked={settings.deviceLock === true}
            onChange={(v) => patch({ deviceLock: v })}
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
        <PanelHeader icon={<Wifi className="size-4" />} title="App Transport" subtitle="WebView/browser origin status — not Wi-Fi encryption" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-line bg-elevated p-2.5">
            <div className="text-xs text-subtle">Origin</div>
            <div className={cn("text-sm font-semibold", connection.secure ? "text-emerald" : "text-amber")}>
              {connection.secure ? "HTTPS" : "HTTP"}
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
