import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Dashboard } from "@/components/security/dashboard";
import { LockScreen } from "@/components/security/lock-screen";
import { setAndroidDeviceLock, setAndroidGate } from "@/lib/android-lock";
import { useSecurity } from "@/lib/security/store";

export function App() {
  const hydrated = useSecurity((s) => s.hydrated);
  const unlocked = useSecurity((s) => s.unlocked);
  const setHydrated = useSecurity((s) => s.setHydrated);
  const lock = useSecurity((s) => s.lock);
  const deviceLock = useSecurity((s) => s.settings.deviceLock === true);

  useEffect(() => {
    setHydrated();
    const t = window.setTimeout(() => {
      if (!useSecurity.getState().hydrated) {
        useSecurity.setState({ hydrated: true });
      }
    }, 1800);
    return () => window.clearTimeout(t);
  }, [setHydrated]);

  useEffect(() => {
    setAndroidGate(!unlocked);
  }, [unlocked]);

  useEffect(() => {
    setAndroidDeviceLock(deviceLock);
  }, [deviceLock]);

  useEffect(() => {
    const onGate = (e: Event) => {
      const d = String((e as CustomEvent).detail ?? "");
      if (d === "lock" && useSecurity.getState().unlocked) lock();
    };
    window.addEventListener("kys-gate", onGate);
    return () => window.removeEventListener("kys-gate", onGate);
  }, [lock]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="size-8 animate-spin rounded-full border-4 border-elevated border-t-cyan" />
      </div>
    );
  }

  return (
    <BootError>{unlocked ? <Dashboard /> : <LockScreen />}</BootError>
  );
}

class BootError extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { err: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[kysmindset] render", error, info.componentStack);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <p className="text-sm text-fg">Kysmindset hit a snag loading.</p>
        <p className="max-w-sm text-xs text-muted">{this.state.err}</p>
        <button
          type="button"
          className="rounded-md border border-line bg-elevated px-3 py-2 text-sm text-fg"
          onClick={() => {
            try {
              const keys: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("kysmindset")) keys.push(k);
              }
              keys.forEach((k) => localStorage.removeItem(k));
              sessionStorage.removeItem("kysmindset_unlocked");
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
        >
          Reset and reload
        </button>
      </div>
    );
  }
}
