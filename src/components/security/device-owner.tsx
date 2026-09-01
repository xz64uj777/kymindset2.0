import { Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  androidLockNow,
  androidPinNow,
  applyAndroidOwner,
  applyAndroidPin,
  isAndroidApp,
  readOwnerStatus,
  removeAndroidAdmin,
  requestAndroidAdmin,
  type OwnerStatus,
} from "@/lib/android-lock";
import { Panel, PanelHeader } from "./chrome";

export function DeviceOwnerPanel() {
  const android = isAndroidApp();
  const [st, setSt] = useState<OwnerStatus | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const refresh = useCallback(() => {
    setSt(readOwnerStatus());
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const role = !android
    ? "Web only"
    : st?.owner
      ? "Device owner"
      : st?.admin
        ? "Device admin"
        : "Not enrolled";

  return (
    <Panel>
      <PanelHeader
        icon={<Shield className="size-4" />}
        title="Device lock"
        subtitle="One tap in Android. No computer, no factory reset."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={st?.owner ? "emerald" : st?.admin ? "cyan" : "muted"}>{role}</Badge>
        {st?.pinOnLock ? <Badge tone="amber">Screen pin on</Badge> : null}
        {st?.lockTask ? <Badge tone="cyan">Lock-task ready</Badge> : null}
        {st?.keyguardOff ? <Badge tone="emerald">System keyguard off</Badge> : null}
      </div>

      {!android ? (
        <p className="text-xs text-muted">
          Device lock only runs inside the Android APK.
        </p>
      ) : st?.owner ? (
        <OwnerControls st={st} setSt={setSt} />
      ) : st?.admin ? (
        <AdminControls st={st} setSt={setSt} advanced={advanced} setAdvanced={setAdvanced} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Device Admin is the path almost everyone can use. Android shows one system screen.
            After you allow it, turning the screen off locks the phone, and turning it on brings
            Kysmindset over the keyguard.
          </p>
          <p className="text-xs text-muted">
            It is not identical to Device Owner. Admin cannot hide Home or replace the phone PIN.
            Optional screen pinning gets you closer.
          </p>
          <Button
            size="sm"
            onClick={() => {
              requestAndroidAdmin();
              toast.message("Allow Kysmindset as device admin on the next screen.");
            }}
          >
            Enable device admin
          </Button>
        </div>
      )}
    </Panel>
  );
}

function AdminControls({
  st,
  setSt,
  advanced,
  setAdvanced,
}: {
  st: OwnerStatus;
  setSt: (s: OwnerStatus | null) => void;
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Admin is on. Screen off locks the phone. Screen on shows the Kysmindset PIN. Home and
        Recents still work unless you pin the app.
      </p>
      <ToggleRow
        title="Pin app while locked"
        desc="Uses Android screen pinning so Home is blocked until you unpin (usually Recents + Back). For a tighter pin, also turn on Ask for PIN before unpinning in system Security settings."
        checked={Boolean(st.pinOnLock)}
        onChange={(v) => {
          const next = applyAndroidPin(v);
          setSt(next);
          if (v) {
            androidPinNow();
            toast.message("Android may ask to pin this screen.");
          } else {
            toast.success("Screen pin off.");
          }
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => androidLockNow()}>
          Lock phone now
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const next = removeAndroidAdmin();
            setSt(next);
            toast.message("Device admin removed.");
          }}
        >
          Remove admin
        </Button>
      </div>
      <button
        type="button"
        className="text-2xs text-subtle underline-offset-2 hover:text-muted hover:underline"
        onClick={() => setAdvanced(!advanced)}
      >
        {advanced ? "Hide advanced Owner steps" : "Advanced: Device Owner (ADB / reset)"}
      </button>
      {advanced ? <OwnerAdbHint /> : null}
    </div>
  );
}

function OwnerControls({
  st,
  setSt,
}: {
  st: OwnerStatus;
  setSt: (s: OwnerStatus | null) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        This phone treats Kysmindset as the device policy controller. While the lock screen is up,
        Home and Recents are blocked.
      </p>
      <ToggleRow
        title="Replace system keyguard"
        desc="Turns the Android lock screen off so only the Kysmindset PIN is shown. Fails if the phone still has its own PIN or pattern."
        checked={Boolean(st.replaceKeyguard)}
        onChange={(v) => {
          const next = applyAndroidOwner(v);
          setSt(next);
          if (v && next && !next.keyguardOff) {
            toast.error(
              "Android kept its keyguard. Remove the phone PIN/pattern, then toggle this again.",
            );
          } else {
            toast.success(v ? "Kysmindset will own the lock." : "System keyguard restored.");
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const next = removeAndroidAdmin();
          setSt(next);
          toast.message(
            "Asked Android to drop admin. Device Owner may need a factory reset to fully clear.",
          );
        }}
      >
        Remove admin
      </Button>
    </div>
  );
}

function OwnerAdbHint() {
  return (
    <div className="space-y-2 rounded-md border border-line bg-elevated p-3">
      <p className="text-xs text-muted">
        Device Owner can hide Home and replace the system lock. Android blocks an app from giving
        itself that role after you sign into accounts. Skip this unless you can factory-reset.
      </p>
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
