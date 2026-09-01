import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkAndroidUpdate,
  isAndroidApp,
  readAppVersion,
  startAndroidUpdate,
  subscribeAndroidUpdate,
  type UpdateEvent,
} from "@/lib/android-lock";
import { Panel, PanelHeader } from "./chrome";

export function AppUpdatePanel() {
  const android = isAndroidApp();
  const ver = android ? readAppVersion() : null;
  const [evt, setEvt] = useState<UpdateEvent | null>(null);

  useEffect(() => {
    if (!android) return;
    const off = subscribeAndroidUpdate(setEvt);
    checkAndroidUpdate();
    return off;
  }, [android]);

  const state = evt?.state ?? "idle";
  const busy = state === "download" || state === "install";
  const available = state === "available";
  const current = state === "current";

  return (
    <Panel>
      <PanelHeader
        icon={<RefreshCw className="size-4" />}
        title="App update"
        subtitle="Pull the latest APK from GitHub and install it here"
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={available ? "amber" : current ? "emerald" : "muted"}>
          {available ? "Update ready" : current ? "Current" : android ? state : "Web only"}
        </Badge>
        {ver ? (
          <span className="font-mono text-2xs text-subtle">
            {ver.name} ({ver.code})
          </span>
        ) : null}
        {evt?.remote ? (
          <span className="font-mono text-2xs text-subtle">latest {evt.remote}</span>
        ) : null}
      </div>
      {!android ? (
        <p className="text-xs text-muted">
          In-app update only runs inside the Android APK. Install from the GitHub release once,
          then updates happen here.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Checks the apk-latest release. Android may ask to allow installs from Kysmindset the
            first time. Play Protect can warn on this debug build — that is expected.
          </p>
          {state === "download" ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full bg-cyan transition-all"
                style={{ width: `${evt?.pct ?? 0}%` }}
              />
            </div>
          ) : null}
          {evt?.error ? <p className="text-xs text-rose">{evt.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEvt({ state: "checking" });
                checkAndroidUpdate();
              }}
            >
              Check
            </Button>
            <Button
              size="sm"
              disabled={busy || current}
              onClick={() => {
                toast.message("Downloading update…");
                startAndroidUpdate();
              }}
            >
              {busy ? `Updating ${evt?.pct ?? 0}%` : "Update now"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
