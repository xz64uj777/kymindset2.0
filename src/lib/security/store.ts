import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useMemo } from "react";
import { notify, readDevicePosture, setAppBadge, setDeviceKill, type DevicePosture } from "@/lib/native";
import { authConfigured, setAuthPin, verifyAuthPin } from "@/lib/auth";
import { clamp, uid } from "@/lib/utils";
import { DEFAULT_PERMISSIONS, HONEYPOT_DEFS, isProtectedName } from "./catalog";
import {
  applyGuard,
  blockHost,
  blockedHostList,
  bootEngine,
  drainEvents,
  linkKbpsNow,
  probeDecoy,
  probeOutbound,
  queryPermissionFlags,
  readConnection,
  sampleProcesses,
  sampleResources,
  snapshotPosture,
  unregisterGuardWorker,
  unblockHost,
} from "./engine";
import type {
  AllowItem,
  ConnectionInfo,
  DeepScanResult,
  HistoryItem,
  Honeypot,
  Indicator,
  Intrusion,
  Permission,
  ScanEvent,
  ScoreBreakdown,
  SecurityActivity,
  Settings,
  TabId,
  TamperEvent,
} from "./types";

const UNLOCK_KEY = "kysmindset_unlocked";

function computeScore(
  activities: SecurityActivity[],
  honeypots: Honeypot[],
  settings: Settings,
  connection: ConnectionInfo,
  killSwitch: boolean,
  lockdown: boolean,
  devicePosture: DevicePosture | null,
): ScoreBreakdown {
  void killSwitch;
  void lockdown;
  let score = 100;
  const factors: { label: string; deduction: number }[] = [];
  const threats = (activities ?? []).filter((a) => a.status === "suspicious");
  if (threats.length > 0) {
    const d = Math.min(threats.length * 5, 30);
    score -= d;
    factors.push({
      label: `${threats.length} confirmed app finding${threats.length > 1 ? "s" : ""}`,
      deduction: d,
    });
  }
  if (!settings?.tamperProtection) {
    score -= 15;
    factors.push({ label: "Tamper Protection disabled", deduction: 15 });
  }
  const disarmed = (honeypots ?? []).filter((h) => !h.armed).length;
  if (disarmed > 0) {
    const d = disarmed * 3;
    score -= d;
    factors.push({
      label: `${disarmed} disarmed decoy${disarmed > 1 ? "s" : ""}`,
      deduction: d,
    });
  }
  if (!connection.secure) {
    score -= 20;
    factors.push({ label: "Insecure (HTTP) connection", deduction: 20 });
  }
  if (devicePosture) {
    if (devicePosture.rootSignals) {
      score -= 25;
      factors.push({ label: "Android root indicators detected", deduction: 25 });
    }
    if (devicePosture.debuggerAttached) {
      score -= 15;
      factors.push({ label: "Debugger attached to app", deduction: 15 });
    }
    if (!devicePosture.deviceSecure) {
      score -= 10;
      factors.push({ label: "Android secure screen lock is off", deduction: 10 });
    }
  }
  score = clamp(Math.round(score), 0, 100);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const status =
    score >= 90 ? "excellent" : score >= 70 ? "fair" : score >= 50 ? "at_risk" : "critical";
  const label =
    status === "excellent"
      ? "Secure"
      : status === "fair"
        ? "Fair"
        : status === "at_risk"
          ? "At Risk"
          : "Critical";
  return { score, grade, status, label, factors };
}

function seedHoneypots(): Honeypot[] {
  return HONEYPOT_DEFS.map((d) => ({
    id: d.path,
    name: d.name,
    decoyType: d.decoyType,
    description: d.description,
    severity: d.severity,
    armed: true,
    path: d.path,
  }));
}

function syncGuardFrom(get: () => SecurityState) {
  const s = get();
  const blocked = [
    ...blockedHostList(),
    ...s.activities
      .filter(
        (a) =>
          a.type === "traffic" &&
          (a.status === "blocked" || a.status === "killed") &&
          a.destination,
      )
      .map((a) => a.destination as string),
  ];
  applyGuard({
    kill: s.killSwitch,
    lockdown: s.lockdown,
    blocked,
    armed: s.honeypots.filter((h) => h.armed).map((h) => h.path),
  });
}

export interface SecurityState {
  hydrated: boolean;
  unlocked: boolean;
  tab: TabId;
  activities: SecurityActivity[];
  honeypots: Honeypot[];
  intrusions: Intrusion[];
  indicators: Indicator[];
  allowlist: AllowItem[];
  settings: Settings;
  permissions: Permission[];
  history: HistoryItem[];
  scanLog: ScanEvent[];
  killSwitch: boolean;
  droppedPackets: number;
  linkKbps: number;
  lockdown: boolean;
  tamperLog: TamperEvent[];
  lastTamper: TamperEvent | null;
  scanning: boolean;
  lastScan: number | null;
  deepScan: DeepScanResult | null;
  deepScanning: boolean;
  pendingDecision: SecurityActivity | null;
  connection: ConnectionInfo;
  devicePosture: DevicePosture | null;
  tick: number;
  setHydrated: () => void;
  setTab: (t: TabId) => void;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  setPin: (pin: string) => Promise<boolean>;
  toggleKillSwitch: () => void;
  toggleLockdown: () => void;
  updateActivity: (id: string, patch: Partial<SecurityActivity>) => void;
  allow: (id: string) => void;
  block: (id: string, note?: string) => void;
  blockSubnet: (id: string) => void;
  kill: (id: string, note?: string) => boolean;
  pause: (id: string) => boolean;
  resume: (id: string) => void;
  resolveAllThreats: () => void;
  autoFixScan: () => { fixed: number; manual: number };
  clearResolved: () => void;
  refresh: () => void;
  addAllow: (item: Omit<AllowItem, "id">) => void;
  removeAllow: (id: string) => void;
  toggleHoneypot: (id: string) => void;
  runPenTest: () => void;
  runSecurityAnalysis: () => Promise<void>;
  runDeepScan: () => void;
  patchSettings: (patch: Partial<Settings>) => void;
  setPermission: (id: string, granted: boolean) => void;
  setPending: (a: SecurityActivity | null) => void;
  decide: (
    id: string,
    action: "allow" | "allowlist" | "block" | "subnet" | "monitor" | "lockdown",
  ) => void;
  liveTick: () => void;
}

function pushHistory(
  history: HistoryItem[],
  action: string,
  target: string,
  detail: string,
): HistoryItem[] {
  return [{ id: uid("hx"), at: Date.now(), action, target, detail }, ...history].slice(0, 80);
}

export const useSecurity = create<SecurityState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      unlocked: false,
      tab: "overview",
      activities: [],
      honeypots: seedHoneypots(),
      intrusions: [],
      indicators: [],
      allowlist: [
        { id: "al-ui", name: "Kysmindset", type: "process" },
        { id: "al-sw", name: "Service Worker", type: "process" },
      ],
      settings: {
        alwaysOn: true,
        autoRestart: true,
        tamperProtection: true,
        autoLockdown: false,
        slackAlerts: false,
        autoScanMin: 30,
        pin: "",
        autoLock: true,
        deviceLock: false,
      },
      permissions: DEFAULT_PERMISSIONS,
      history: [],
      scanLog: [],
      killSwitch: false,
      droppedPackets: 0,
      linkKbps: 0,
      lockdown: false,
      tamperLog: [],
      lastTamper: null,
      scanning: false,
      lastScan: null,
      deepScan: null,
      deepScanning: false,
      pendingDecision: null,
      connection: { effectiveType: "4G", secure: true, saveData: false },
      devicePosture: readDevicePosture(),
      tick: 0,
      setHydrated: () => {
        if (get().hydrated) return;
        try {
          localStorage.removeItem("kysmindset-v4");
        } catch {
          /* storage may be unavailable */
        }
        const finish = () => {
          const unlocked =
            (typeof sessionStorage !== "undefined" &&
              sessionStorage.getItem(UNLOCK_KEY) === "1") ||
            !authConfigured();
          const falseStorageRewrite = (event: TamperEvent) =>
            event.cause.startsWith("Security store rewritten from another tab (");
          const tamperLog = (get().tamperLog ?? []).filter((event) => !falseStorageRewrite(event));
          const previousLastTamper = get().lastTamper ?? null;
          const lastTamper =
            previousLastTamper && falseStorageRewrite(previousLastTamper)
              ? tamperLog[0] ?? null
              : previousLastTamper;
          const native = readDevicePosture();
          const restoredKillSwitch = get().killSwitch || Boolean(native?.vpnDesired);
          set({
            hydrated: true,
            unlocked,
            connection: readConnection(),
            tamperLog,
            lastTamper,
            killSwitch: restoredKillSwitch,
            devicePosture: native,
          });
          void bootEngine().then(async () => {
            syncGuardFrom(get);
            const flags = await queryPermissionFlags();
            set({
              permissions: get().permissions.map((p) =>
                flags[p.id] != null ? { ...p, granted: flags[p.id] } : p,
              ),
            });
            get().liveTick();
          });
        };
        const api = useSecurity.persist;
        const pending = api.hasHydrated()
          ? Promise.resolve()
          : Promise.resolve(api.rehydrate()).catch((err) => {
              console.warn("[kysmindset] persist rehydrate failed", err);
            });
        void Promise.race([pending, wait(1200)]).then(finish);
      },
      setTab: (tab) => set({ tab }),
      unlock: async (pin) => {
        if (pin === "__bio__") {
          sessionStorage.setItem(UNLOCK_KEY, "1");
          set({ unlocked: true });
          return true;
        }
        const result = await verifyAuthPin(pin);
        if (!result.ok) return false;
        sessionStorage.setItem(UNLOCK_KEY, "1");
        set({ unlocked: true });
        return true;
      },
      lock: () => {
        sessionStorage.removeItem(UNLOCK_KEY);
        set({ unlocked: false, pendingDecision: null });
      },
      setPin: async (pin) => {
        const ok = await setAuthPin(pin);
        if (ok) set({ settings: { ...get().settings, pin: "" } });
        return ok;
      },
      toggleKillSwitch: () => {
        const next = !get().killSwitch;
        const before = get().activities;
        const activities = next
          ? before.map((a) =>
              a.type === "traffic" && a.status !== "blocked" && a.status !== "killed"
                ? {
                    ...a,
                    prevStatus: a.status,
                    status: "blocked" as const,
                    resolveNote: "Network kill switch",
                  }
                : a,
            )
          : before.map((a) =>
              a.resolveNote === "Network kill switch" && a.prevStatus
                ? {
                    ...a,
                    status: a.prevStatus,
                    resolveNote: undefined,
                    prevStatus: undefined,
                  }
                : a,
            );
        set({
          killSwitch: next,
          activities,
          tab: get().tab,
          linkKbps: next ? 0 : linkKbpsNow(false),
          history: pushHistory(
            get().history,
            next ? "Kill switch armed" : "Kill switch released",
            "Network",
            next
              ? "Arming Kysmindset network guard and requesting the Android VPN kill service."
              : "Releasing Kysmindset network guard and Android VPN kill service.",
          ),
        });
        syncGuardFrom(get);
        if (next) void probeOutbound().then(() => get().liveTick());
        void setDeviceKill(next).then((status) => {
          if (status === "denied") {
            set({
              history: pushHistory(
                get().history,
                "Device VPN unavailable",
                "Network",
                "Android VPN permission was denied or unavailable. Kysmindset's app network guard remains active until you stop protection.",
              ),
            });
            // Keep killSwitch true: it represents the app request guard too. The UI reports Android VPN separately.
            syncGuardFrom(get);
          } else if (status === "on") {
            set({
              history: pushHistory(
                get().history,
                "Device VPN up",
                "Network",
                "Android VPN kill service is active. Apps not on the VPN allowlist are routed into the discard tunnel.",
              ),
            });
          } else if (status === "app") {
            set({
              history: pushHistory(
                get().history,
                "App-only kill",
                "Network",
                "This runtime has no Android VPN bridge; protection is limited to Kysmindset-originated requests.",
              ),
            });
          }
        });
      },
      toggleLockdown: () => {
        const next = !get().lockdown;
        let activities = get().activities;
        if (next) {
          activities = activities.map((a) =>
            a.status === "suspicious" || a.status === "unknown"
              ? {
                  ...a,
                  prevStatus: a.status,
                  status: "blocked" as const,
                  resolveNote: "Emergency lockdown",
                }
              : a,
          );
        } else {
          activities = activities.map((a) =>
            a.resolveNote === "Emergency lockdown" && a.prevStatus
              ? { ...a, status: a.prevStatus, resolveNote: undefined, prevStatus: undefined }
              : a,
          );
        }
        set({
          lockdown: next,
          activities,
          history: pushHistory(
            get().history,
            next ? "Lockdown armed" : "Lockdown lifted",
            "Device",
            next
              ? "Unknown and suspicious activity is blocked until you lift lockdown."
              : "Unknown items restored. Device back to normal.",
          ),
        });
        syncGuardFrom(get);
      },
      updateActivity: (id, patch) =>
        set({
          activities: get().activities.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }),
      allow: (id) => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) return;
        if (a.type === "traffic" && a.destination) unblockHost(a.destination);
        set({
          activities: get().activities.map((x) =>
            x.id === id ? { ...x, status: "allowed" as const, resolveNote: "Allowed by user" } : x,
          ),
          history: pushHistory(get().history, "Allowed", a.name, a.details),
        });
        syncGuardFrom(get);
      },
      block: (id, note = "Blocked by user") => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) return;
        const indicators = [...get().indicators];
        const ip = a.source || a.destination;
        if (ip && !indicators.some((i) => i.value === ip)) {
          indicators.unshift({
            id: uid("ind"),
            value: ip,
            kind: "host",
            reasoning: note,
            at: Date.now(),
          });
        }
        set({
          activities: get().activities.map((x) =>
            x.id === id ? { ...x, status: "blocked" as const, resolveNote: note } : x,
          ),
          indicators: indicators.slice(0, 40),
          history: pushHistory(get().history, "Blocked", a.name, note),
        });
        if (a.destination) blockHost(a.destination);
        syncGuardFrom(get);
      },
      blockSubnet: (id) => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) return;
        get().block(id, "Subnet blocked by user from dashboard");
      },
      kill: (id, note = "Ended by user") => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) return false;
        if (
          get().settings.tamperProtection &&
          a.type !== "traffic" &&
          isProtectedName(a.name) &&
          a.status === "allowed"
        ) {
          const ev: TamperEvent = {
            id: uid("tp"),
            at: Date.now(),
            target: a.name,
            action: "kill",
            actor: "user",
            cause: `Stop ${a.type} “${a.name}” — protected by Tamper Protection`,
          };
          set({
            tamperLog: [ev, ...get().tamperLog].slice(0, 40),
            lastTamper: ev,
            history: pushHistory(get().history, "Tamper blocked", a.name, ev.cause),
          });
          return false;
        }
        set({
          activities: get().activities.map((x) =>
            x.id === id
              ? { ...x, status: "killed" as const, cpu: 0, dataKb: x.dataKb, resolveNote: note }
              : x,
          ),
          history: pushHistory(get().history, "Ended", a.name, note),
        });
        if (a.type === "traffic" && a.destination) blockHost(a.destination);
        if (a.name === "Service Worker") {
          void unregisterGuardWorker();
        }
        syncGuardFrom(get);
        return true;
      },
      pause: (id) => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) return false;
        if (get().settings.tamperProtection && isProtectedName(a.name) && a.status === "allowed") {
          const ev: TamperEvent = {
            id: uid("tp"),
            at: Date.now(),
            target: a.name,
            action: "pause",
            actor: "user",
            cause: `Pause ${a.type} “${a.name}” — protected by Tamper Protection`,
          };
          set({
            tamperLog: [ev, ...get().tamperLog].slice(0, 40),
            lastTamper: ev,
            history: pushHistory(get().history, "Tamper blocked", a.name, ev.cause),
          });
          return false;
        }
        set({
          activities: get().activities.map((x) =>
            x.id === id
              ? {
                  ...x,
                  prevStatus: x.status,
                  prevCpu: x.cpu,
                  status: "paused" as const,
                  cpu: 0,
                  resolveNote: "Paused by user",
                }
              : x,
          ),
          history: pushHistory(get().history, "Paused", a.name, "Process paused"),
        });
        return true;
      },
      resume: (id) => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) return;
        set({
          activities: get().activities.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: x.prevStatus && x.prevStatus !== "paused" ? x.prevStatus : "allowed",
                  cpu: x.prevCpu ?? 1,
                  prevStatus: undefined,
                  prevCpu: undefined,
                  resolveNote: undefined,
                }
              : x,
          ),
          history: pushHistory(get().history, "Resumed", a.name, "Process resumed"),
        });
      },
      resolveAllThreats: () => {
        const n = get().activities.filter((a) => a.status === "suspicious").length;
        set({
          activities: get().activities.map((a) =>
            a.status === "suspicious"
              ? { ...a, status: "blocked" as const, resolveNote: "Confirmed finding blocked by user" }
              : a,
          ),
          history: pushHistory(
            get().history,
            "Block confirmed findings",
            `${n} items`,
            "Confirmed suspicious items blocked; unknown items remain for review.",
          ),
        });
        syncGuardFrom(get);
      },
      autoFixScan: () => {
        const state = get();
        const confirmedTraffic = state.activities.filter(
          (a) => a.type === "traffic" && a.status === "suspicious",
        );
        const disarmed = state.honeypots.filter((h) => !h.armed);
        const needsTamper = !state.settings.tamperProtection;

        for (const item of confirmedTraffic) {
          get().block(item.id, "Auto Fix: confirmed tracker finding");
        }
        if (disarmed.length || needsTamper) {
          set({
            honeypots: get().honeypots.map((h) => ({ ...h, armed: true })),
            settings: needsTamper
              ? { ...get().settings, tamperProtection: true }
              : get().settings,
          });
        }
        syncGuardFrom(get);

        const native = readDevicePosture();
        const remaining = get().activities.filter(
          (a) => a.status === "unknown" || (a.status === "suspicious" && a.type !== "traffic"),
        ).length;
        const deviceManual = native
          ? Number(native.rootSignals) + Number(native.debuggerAttached) + Number(!native.deviceSecure)
          : 0;
        const fixed = confirmedTraffic.length + disarmed.length + Number(needsTamper);
        const manual = remaining + deviceManual;
        set({
          history: pushHistory(
            get().history,
            "Auto Fix",
            `${fixed} safe fix${fixed === 1 ? "" : "es"}`,
            manual
              ? `${manual} item${manual === 1 ? "" : "s"} still require manual review.`
              : "No remaining manual review items detected.",
          ),
        });
        return { fixed, manual };
      },
      clearResolved: () => {
        const keep = get().activities.filter(
          (a) => a.status !== "resolved" && a.status !== "blocked" && a.status !== "killed",
        );
        set({
          activities: keep,
          history: pushHistory(get().history, "Cleared resolved", "Monitor", "Removed resolved items."),
        });
      },
      refresh: () => {
        set({ tick: get().tick + 1, connection: readConnection() });
        get().liveTick();
      },
      addAllow: (item) =>
        set({ allowlist: [{ id: uid("al"), ...item }, ...get().allowlist] }),
      removeAllow: (id) =>
        set({ allowlist: get().allowlist.filter((a) => a.id !== id) }),
      toggleHoneypot: (id) => {
        set({
          honeypots: get().honeypots.map((h) =>
            h.id === id ? { ...h, armed: !h.armed } : h,
          ),
        });
        syncGuardFrom(get);
      },
      runPenTest: () => {
        const armed = get().honeypots.filter((h) => h.armed);
        if (armed.length === 0) return;
        set({
          history: pushHistory(
            get().history,
            "Pen test",
            `${armed.length} decoys`,
            "Probing armed decoy paths on this origin.",
          ),
        });
        void Promise.all(armed.map((hp) => probeDecoy(hp.path))).then(() => get().liveTick());
      },
      runSecurityAnalysis: async () => {
        if (get().scanning) return;
        set({ scanning: true, scanLog: [] });
        const push = (message: string, kind: ScanEvent["kind"]) => {
          set({
            scanLog: [{ id: uid("sc"), at: Date.now(), message, kind }, ...get().scanLog].slice(
              0,
              80,
            ),
          });
        };
        push("Security analysis started — evaluating observable posture", "info");
        await wait(280);
        get().liveTick();
        const snap = await snapshotPosture();
        const native = readDevicePosture();
        set({ devicePosture: native });
        push(
          snap.secure ? "Transport is HTTPS" : "Insecure HTTP — session can be read",
          snap.secure ? "ok" : "threat",
        );
        await wait(220);
        push(snap.online ? "Device is online" : "Device is offline", snap.online ? "ok" : "learn");
        await wait(220);
        const flags = await queryPermissionFlags();
        set({
          permissions: get().permissions.map((p) =>
            flags[p.id] != null ? { ...p, granted: flags[p.id] } : p,
          ),
        });
        const granted = get().permissions.filter((p) => p.granted);
        push(
          granted.length
            ? `Granted: ${granted.map((p) => p.name).join(", ")}`
            : "No extra device permissions granted",
          "info",
        );
        await wait(220);
        push(
          snap.nativeApp
            ? "Native Android runtime detected — WebView bridge and VPN controls are available"
            : snap.sw
              ? "Service worker is controlling this origin"
              : "Service worker not controlling — install the PWA for web request interception",
          snap.nativeApp || snap.sw ? "ok" : "learn",
        );
        await wait(220);
        push(
          snap.persisted
            ? `Persistent storage on · ${snap.usedMb} / ${snap.quotaMb} MB`
            : `Storage not persisted · ${snap.usedMb} / ${snap.quotaMb} MB`,
          snap.persisted ? "ok" : "learn",
        );
        await wait(220);
        push(
          get().killSwitch
            ? "Kill switch is armed — checking whether device VPN is up"
            : "Kill switch is idle",
          get().killSwitch ? "learn" : "info",
        );
        if (native) {
          push(
            native.vpnActive ? "Android VPN kill tunnel is active" : "Android VPN kill tunnel is inactive",
            native.vpnActive ? "ok" : "info",
          );
          push(
            native.rootSignals
              ? `Root indicators detected: ${native.rootEvidence.join(", ")}`
              : "No common Android root indicators detected",
            native.rootSignals ? "threat" : "ok",
          );
          push(
            native.debuggerAttached ? "Debugger is attached to Kysmindset" : "No debugger attached",
            native.debuggerAttached ? "threat" : "ok",
          );
          push(
            native.deviceSecure ? "Android secure screen lock is enabled" : "Android secure screen lock is not enabled",
            native.deviceSecure ? "ok" : "learn",
          );
          push(
            `Android ${native.release} · API ${native.api} · security patch ${native.securityPatch || "unknown"}`,
            "info",
          );
        }
        await wait(220);
        if (snap.thirdPartyHosts.length) {
          push(
            `${snap.thirdPartyHosts.length} third-party host${snap.thirdPartyHosts.length === 1 ? "" : "s"}: ${snap.thirdPartyHosts.slice(0, 6).join(", ")}`,
            "learn",
          );
          // Analysis is evidence-only. Remediation is chosen from Scan Results.
        } else {
          push("No third-party or tracker hosts in this session", "ok");
        }
        await wait(220);
        if (snap.thirdPartyScripts > 0) {
          push(`${snap.thirdPartyScripts} third-party script(s) in the document`, "learn");
        }
        const suspicious = get().activities.filter((a) => a.status === "suspicious");
        const unknown = get().activities.filter((a) => a.status === "unknown");
        push(
          suspicious.length || unknown.length
            ? `${suspicious.length} tracker finding${suspicious.length === 1 ? "" : "s"} · ${unknown.length} unclassified host${unknown.length === 1 ? "" : "s"}`
            : "No active app-session findings — board is clear",
          suspicious.length ? "threat" : unknown.length ? "learn" : "ok",
        );
        await wait(180);
        push("Scan complete", "ok");
        set({ scanning: false, lastScan: Date.now() });
      },
      runDeepScan: () => {
        set({ deepScanning: true, deepScan: null });
        void snapshotPosture().then((snap) => {
          const s = scoreOf(get());
          const openFindings = get().activities.filter(
            (a) => a.status === "suspicious" || a.status === "unknown",
          );
          const blocked = get().activities.filter((a) => a.status === "blocked").length;
          const disarmed = get().honeypots.filter((h) => !h.armed);
          const vulns: DeepScanResult["vulnerabilities"] = [];
          const recs: DeepScanResult["recommendations"] = [];
          const strengths: string[] = [];
          if (!snap.secure)
            vulns.push({ name: "Insecure (HTTP) connection", severity: "critical" });
          if (!snap.nativeApp && !snap.sw)
            vulns.push({
              name: "Service worker is not controlling this web origin",
              severity: "medium",
            });
          if (snap.thirdPartyHosts.length)
            recs.push({
              action: `Review ${snap.thirdPartyHosts.length} third-party connection${snap.thirdPartyHosts.length === 1 ? "" : "s"} before allowing`,
              priority: "medium",
            });
          if (disarmed.length)
            vulns.push({ name: `${disarmed.length} disarmed decoys`, severity: "medium" });
          if (!get().settings.tamperProtection)
            vulns.push({ name: "Tamper Protection is off", severity: "high" });
          const confirmedOpen = openFindings.filter((a) => a.status === "suspicious").length;
          const unknownOpen = openFindings.filter((a) => a.status === "unknown").length;
          if (confirmedOpen)
            recs.push({ action: `Block or inspect ${confirmedOpen} confirmed alert${confirmedOpen === 1 ? "" : "s"}`, priority: "high" });
          if (unknownOpen)
            recs.push({ action: `Review ${unknownOpen} unknown or unclassified connection${unknownOpen === 1 ? "" : "s"}`, priority: "medium" });
          if (!snap.nativeApp && !snap.sw)
            recs.push({ action: "Install the PWA so the worker can intercept web requests", priority: "high" });
          if (!snap.persisted)
            recs.push({ action: "Grant persistent storage in Config", priority: "medium" });
          if (get().settings.alwaysOn) strengths.push("Always-on monitoring is active");
          if (snap.secure) strengths.push("HTTPS transport");
          if (snap.nativeApp) strengths.push("Native Android runtime bridge is live");
          else if (snap.sw) strengths.push("Service worker intercept is live");
          const native = readDevicePosture();
          if (native) {
            set({ devicePosture: native });
            if (native.rootSignals)
              vulns.push({ name: "Android root indicators detected", severity: "high" });
            else strengths.push("No common Android root indicators detected");
            if (native.debuggerAttached)
              vulns.push({ name: "Debugger attached to Kysmindset", severity: "high" });
            if (!native.deviceSecure) {
              vulns.push({ name: "Android secure screen lock is off", severity: "high" });
              recs.push({ action: "Enable a secure Android screen lock", priority: "high" });
            }
            if (native.securityPatch) strengths.push(`Android security patch ${native.securityPatch}`);
          }
          if (blocked > 0) strengths.push(`${blocked} hosts already blocked`);
          if (s.score >= 80) strengths.push("Posture grade is in the secure band");
          set({
            deepScanning: false,
            lastScan: Date.now(),
            deepScan: {
              assessment:
                s.score >= 85
                  ? "No confirmed scan alerts. Review third-party connections and permissions as needed."
                  : s.score >= 70
                    ? "Fair posture. Review unknown hosts and restore any weakened controls."
                    : "Elevated posture deductions. Review open traffic and restore weakened protection.",
              vulnerabilities: vulns,
              recommendations: recs,
              strengths,
            },
          });
        });
      },
      patchSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      setPermission: (id, granted) =>
        set({
          permissions: get().permissions.map((p) => (p.id === id ? { ...p, granted } : p)),
        }),
      setPending: (pendingDecision) => set({ pendingDecision }),
      decide: (id, action) => {
        const a = get().activities.find((x) => x.id === id);
        if (!a) {
          set({ pendingDecision: null });
          return;
        }
        if (action === "allow") get().allow(id);
        if (action === "allowlist") {
          get().allow(id);
          get().addAllow({ name: a.name, type: a.type });
        }
        if (action === "block") get().block(id);
        if (action === "subnet") get().blockSubnet(id);
        if (action === "monitor") {
          set({
            history: pushHistory(get().history, "Monitor only", a.name, "Keep watching, take no action"),
          });
        }
        if (action === "lockdown") {
          get().block(id, "Trigger lockdown");
          if (!get().lockdown) get().toggleLockdown();
        }
        set({ pendingDecision: null });
      },
      liveTick: () => {
        const st = get();
        const nativePosture = readDevicePosture();
        if (nativePosture) set({ devicePosture: nativePosture });
        const pausedMonitor = st.activities.some(
          (a) => a.id === "proc-kysmindset" && a.status === "paused",
        );
        if (pausedMonitor) {
          set({ tick: st.tick + 1, connection: readConnection() });
          return;
        }
        const paused = new Set(
          st.activities.filter((a) => a.status === "paused" || a.status === "killed").map((a) => a.id),
        );
        const resources = sampleResources();
        const processes = sampleProcesses().map((p) => {
          const prev = st.activities.find((a) => a.id === p.id);
          if (prev && (prev.status === "paused" || prev.status === "killed")) return prev;
          return p;
        });
        const byId = new Map<string, SecurityActivity>();
        for (const a of st.activities) {
          if (a.status === "killed" || a.status === "paused" || a.status === "blocked") byId.set(a.id, a);
        }
        for (const a of [...resources, ...processes]) {
          if (paused.has(a.id)) continue;
          const keep = byId.get(a.id);
          if (keep && (keep.status === "blocked" || keep.status === "killed")) {
            byId.set(a.id, {
              ...a,
              status: keep.status,
              resolveNote: keep.resolveNote,
              prevStatus: keep.prevStatus,
            });
          } else {
            byId.set(a.id, a);
          }
        }

        let droppedPackets = st.droppedPackets;
        let intrusions = st.intrusions;
        let indicators = st.indicators;
        let history = st.history;
        let tamperLog = st.tamperLog ?? [];
        let lastTamper = st.lastTamper ?? null;

        for (const ev of drainEvents()) {
          if (ev.type === "drop") {
            droppedPackets += 1;
            const id = `net-${ev.host}`;
            const prev = byId.get(id);
            byId.set(id, {
              id,
              type: "traffic",
              name: ev.host,
              status: "blocked",
              createdAt: ev.at,
              details: `Dropped (${ev.reason})`,
              destination: ev.host,
              protocol: "HTTPS",
              direction: "outbound",
              dataKb: prev?.dataKb ?? 0,
              resolveNote: ev.reason === "kill" ? "Network kill switch" : "Blocklist",
            });
          }
          if (ev.type === "honeypot") {
            const hp = st.honeypots.find((h) => h.path === ev.path);
            intrusions = [
              {
                id: uid("in"),
                honeypotId: hp?.id ?? ev.path,
                honeypotName: ev.name,
                source: "this device",
                payload: `${ev.method} ${ev.path}`,
                at: ev.at,
                autoBlocked: true,
              },
              ...intrusions,
            ].slice(0, 40);
            if (!indicators.some((i) => i.value === ev.path)) {
              indicators = [
                {
                  id: uid("ind"),
                  value: ev.path,
                  kind: "path" as const,
                  reasoning: `Honeypot: ${ev.name}`,
                  at: ev.at,
                },
                ...indicators,
              ].slice(0, 40);
            }
            history = pushHistory(history, "Honeypot catch", ev.name, `${ev.method} ${ev.path}`);
            if (st.permissions.some((p) => p.id === "push" && p.granted)) {
              notify("Honeypot catch", `${ev.name} — ${ev.path}`);
            }
          }
          if (ev.type === "tamper") {
            const te: TamperEvent = {
              id: uid("tp"),
              at: ev.at,
              target: ev.target,
              action: "stop-monitor",
              actor: "intruder",
              cause: ev.cause,
            };
            tamperLog = [te, ...tamperLog].slice(0, 40);
            lastTamper = te;
            history = pushHistory(history, "Tamper blocked", ev.target, ev.cause);
          }
        }

        const activities = [...byId.values()]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 80);
        set({
          activities,
          intrusions,
          indicators,
          history,
          tick: st.tick + 1,
          connection: readConnection(),
          devicePosture: readDevicePosture(),
          droppedPackets,
          linkKbps: linkKbpsNow(st.killSwitch),
          tamperLog,
          lastTamper,
        });
        const confirmedFindingCount = activities.filter(
          (a) => a.status === "suspicious",
        ).length;
        setAppBadge(confirmedFindingCount);
      },
    }),
    {
      name: "kysmindset-v5",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 5,
      migrate: () => ({}) as SecurityState,
      partialize: (s) => ({
        honeypots: s.honeypots,
        allowlist: s.allowlist,
        settings: { ...s.settings, pin: "" },
        permissions: s.permissions,
        history: s.history.slice(0, 40),
        scanLog: (s.scanLog ?? []).slice(0, 40),
        lastScan: s.lastScan,
        killSwitch: s.killSwitch,
        droppedPackets: s.droppedPackets,
        tamperLog: (s.tamperLog ?? []).slice(0, 40),
        lastTamper: s.lastTamper ?? null,
      }),
      merge: (persisted, current) => {
        const p =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<SecurityState>)
            : {};
        return {
          ...current,
          ...p,
          hydrated: false,
          unlocked: false,
          scanning: false,
          deepScanning: false,
          pendingDecision: null,
          tamperLog: Array.isArray(p.tamperLog) ? p.tamperLog : [],
          lastTamper: p.lastTamper ?? null,
          activities: current.activities,
          honeypots: Array.isArray(p.honeypots) ? p.honeypots : current.honeypots,
          settings: { ...current.settings, ...(p.settings ?? {}) },
          connection: current.connection,
          devicePosture: current.devicePosture,
        };
      },
    },
  ),
);

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function scoreOf(s: SecurityState) {
  return computeScore(
    s.activities,
    s.honeypots,
    s.settings,
    s.connection,
    s.killSwitch,
    s.lockdown,
    s.devicePosture,
  );
}

export function useScore() {
  const activities = useSecurity((s) => s.activities);
  const honeypots = useSecurity((s) => s.honeypots);
  const settings = useSecurity((s) => s.settings);
  const connection = useSecurity((s) => s.connection);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const lockdown = useSecurity((s) => s.lockdown);
  const devicePosture = useSecurity((s) => s.devicePosture);
  return useMemo(
    () => computeScore(activities, honeypots, settings, connection, killSwitch, lockdown, devicePosture),
    [activities, honeypots, settings, connection, killSwitch, lockdown, devicePosture],
  );
}

