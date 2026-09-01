import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import {
  canPromptInstall,
  hideInstallBanner,
  installBannerHidden,
  isIos,
  isPreviewShell,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "@/lib/native";
import { cn } from "@/lib/utils";

export function useInstallState() {
  const [, bump] = useState(0);
  useEffect(() => subscribeInstall(() => bump((n) => n + 1)), []);
  return {
    standalone: isStandalone(),
    preview: isPreviewShell(),
    canInstall: canPromptInstall(),
    ios: isIos(),
  };
}

export function InstallBar({ className }: { className?: string }) {
  const { standalone, preview, canInstall, ios } = useInstallState();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(installBannerHidden());
  }, []);

  if (standalone || hidden) return null;

  if (preview) {
    return (
      <div
        className={cn(
          "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber/20 bg-amber-dim px-3 py-2.5",
          className,
        )}
      >
        <p className="text-xs text-amber">
          Don't install from this live preview — the home-screen shortcut opens a blocked
          link (Access Denied). Open the published Kysmindset page in Safari or Chrome, then Add
          to Home Screen.
        </p>
        <button
          type="button"
          onClick={() => {
            hideInstallBanner();
            setHidden(true);
          }}
          className="shrink-0 text-2xs text-subtle hover:text-muted"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan/20 bg-cyan-dim px-3 py-2.5",
        className,
      )}
    >
      <p className="text-xs text-cyan">
        Install Kysmindset on this device for a full-screen lock, home-screen icon, and native
        alerts.
      </p>
      <div className="flex items-center gap-2">
        {canInstall ? (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="flex items-center gap-1.5 rounded-md border border-cyan/30 bg-elevated px-3 py-1.5 text-xs font-medium text-fg hover:bg-white/10"
          >
            <Download className="size-3.5" />
            Install
          </button>
        ) : ios ? (
          <span className="flex items-center gap-1 text-2xs text-muted">
            <Share className="size-3" />
            Share → Add to Home Screen
          </span>
        ) : (
          <a
            href="/?install=1&platform=ios"
            className="flex items-center gap-1.5 rounded-md border border-cyan/30 bg-elevated px-3 py-1.5 text-xs font-medium text-fg hover:bg-white/10"
          >
            <Download className="size-3.5" />
            How to install
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            hideInstallBanner();
            setHidden(true);
          }}
          className="text-2xs text-subtle hover:text-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
