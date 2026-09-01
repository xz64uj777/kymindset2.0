import type { ConnectionInfo, SecurityActivity } from "./types";
import { HONEYPOT_DEFS, TRACKER_HOSTS } from "./catalog";

export type GuardEvent =
  | { type: "drop"; host: string; reason: string; at: number }
  | { type: "honeypot"; path: string; name: string; method: string; at: number }
  | { type: "tamper"; target: string; cause: string; at: number };

export type GuardState = {
  kill: boolean;
  lockdown: boolean;
  blocked: string[];
  armed: string[];
};

type PerfMem = { usedJSHeapSize: number; jsHeapSizeLimit: number };

const events: GuardEvent[] = [];
const listeners = new Set<(e: GuardEvent) => void>();
const blockedHosts = new Set<string>();
let guard: GuardState = { kill: false, lockdown: false, blocked: [], armed: [] };
let fetchPatched = false;
let xhrPatched = false;
let swReg: ServiceWorkerRegistration | null = null;
let longTasks = 0;
let lastSampleAt = 0;
let bytesWindow = 0;
const inflight = new Set<AbortController>();
const frozenLinks = new Set<HTMLLinkElement>();

function emit(e: GuardEvent) {
  events.push(e);
  listeners.forEach((fn) => fn(e));
}

export function onGuardEvent(fn: (e: GuardEvent) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function drainEvents(): GuardEvent[] {
  return events.splice(0, events.length);
}

function apkStorageOn() {
  if (typeof window === "undefined") return false;
  if ((window as unknown as { KysAndroid?: unknown }).KysAndroid) return true;
  try {
    return location.protocol === "file:";
  } catch {
    return false;
  }
}

export function readConnection(): ConnectionInfo {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const c = (nav as Navigator & { connection?: { effectiveType?: string; saveData?: boolean; downlink?: number; rtt?: number } })
    ?.connection;
  const proto =
    typeof location === "undefined"
      ? true
      : location.protocol === "https:" ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";
  return {
    effectiveType: (c?.effectiveType || "4g").toUpperCase(),
    secure: proto,
    saveData: Boolean(c?.saveData),
    downlink: c?.downlink,
    rtt: c?.rtt,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  };
}

export function linkKbpsNow(kill: boolean) {
  if (kill) return 0;
  const c = readConnection();
  if (c.downlink && c.downlink > 0) return Math.round(c.downlink * 125);
  return bytesWindow > 0 ? Math.round(bytesWindow / 1024) : 0;
}

function hostOf(url: string) {
  try {
    return new URL(url, typeof location === "undefined" ? "https://local" : location.href).host;
  } catch {
    return url;
  }
}

function classifyHost(host: string): { status: SecurityActivity["status"]; label: string } {
  const originHost = typeof location === "undefined" ? "" : location.host;
  const first =
    !host ||
    host === originHost ||
    host.endsWith(".grok-sandbox.com") ||
    host === "grok.com" ||
    host.endsWith(".grok.com") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1");
  if (first) return { status: "allowed", label: "First party" };
  if (TRACKER_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) {
    return { status: "suspicious", label: "Known tracker" };
  }
  if (blockedHosts.has(host) || guard.blocked.includes(host)) {
    return { status: "blocked", label: "Blocklist" };
  }
  if (guard.kill || guard.lockdown) return { status: "blocked", label: guard.kill ? "Kill switch" : "Lockdown" };
  return { status: "unknown", label: "Unclassified third party (not inherently malicious)" };
}

export function sampleResources(): SecurityActivity[] {
  if (typeof performance === "undefined") return [];
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const byHost = new Map<
    string,
    { kb: number; last: number; protocol: string; port: number; initiator: string; name: string }
  >();
  let windowBytes = 0;
  const since = lastSampleAt;
  for (const e of entries) {
    const host = hostOf(e.name);
    if (!host) continue;
    const kb = Math.max(0, Math.round((e.transferSize || e.encodedBodySize || 0) / 1024));
    const end = Math.round(performance.timeOrigin + e.responseEnd);
    const prev = byHost.get(host);
    if (e.responseEnd && performance.timeOrigin + e.startTime >= since) {
      windowBytes += e.transferSize || e.encodedBodySize || 0;
    }
    let protocol = "HTTPS";
    let port = 443;
    try {
      const u = new URL(e.name);
      protocol = (u.protocol.replace(":", "") || "https").toUpperCase();
      port = u.port ? Number(u.port) : protocol === "HTTP" ? 80 : 443;
    } catch {
      /* ignore */
    }
    if (!prev) {
      byHost.set(host, { kb, last: end, protocol, port, initiator: e.initiatorType, name: host });
    } else {
      prev.kb += kb;
      prev.last = Math.max(prev.last, end);
    }
  }
  bytesWindow = windowBytes;
  lastSampleAt = Date.now();

  return [...byHost.entries()].slice(-48).map(([host, v]) => {
    const cls = classifyHost(host);
    return {
      id: `net-${host}`,
      type: "traffic" as const,
      name: host,
      status: cls.status,
      createdAt: v.last || Date.now(),
      details: `${cls.label} · ${v.initiator || "request"}`,
      destination: host,
      destinationPort: v.port,
      protocol: v.protocol,
      direction: "outbound" as const,
      dataKb: v.kb,
      resolveNote:
        cls.status === "blocked"
          ? guard.kill
            ? "Network kill switch"
            : guard.lockdown
              ? "Emergency lockdown"
              : "Blocklist"
          : undefined,
    };
  });
}

export function sampleProcesses(): SecurityActivity[] {
  const mem = (performance as Performance & { memory?: PerfMem }).memory;
  const heapMb = mem ? Math.round(mem.usedJSHeapSize / 1_048_576) : 0;
  const cores = typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency || 0;
  const deviceGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const swOn = Boolean(typeof navigator !== "undefined" && navigator.serviceWorker?.controller);
  const cpu = Math.min(96, longTasks * 8);
  return [
    {
      id: "proc-kysmindset",
      type: "process",
      name: "Kysmindset",
      status: "allowed",
      createdAt: Date.now(),
      details: "App-only telemetry · this PWA’s UI thread",
      cpu,
      memoryMb: heapMb || 1,
    },
    {
      id: "proc-sw",
      type: "process",
      name: "Service Worker",
      status: swOn ? "allowed" : "unknown",
      createdAt: Date.now(),
      details: swOn ? "App-only telemetry · controlling this origin" : "App-only telemetry · service worker not controlling this origin",
      cpu: swOn ? 1 : 0,
      memoryMb: swOn ? 4 : 0,
    },
    {
      id: "proc-device",
      type: "app",
      name: "Browser runtime hints",
      status: "allowed",
      createdAt: Date.now(),
      details: [
        cores ? `${cores} cores` : null,
        deviceGb ? `${deviceGb} GB RAM` : null,
        typeof navigator !== "undefined" ? navigator.platform : null,
      ]
        .filter(Boolean)
        .join(" · ") + " · App-only browser hints",
      cpu: 0,
      memoryMb: deviceGb ? deviceGb * 1024 : undefined,
    },
  ];
}

export function applyGuard(next: GuardState) {
  guard = {
    kill: next.kill,
    lockdown: next.lockdown,
    blocked: [...new Set([...next.blocked, ...blockedHosts])],
    armed: next.armed,
  };
  blockedHosts.clear();
  for (const h of guard.blocked) blockedHosts.add(h);
  const payload = { type: "state", ...guard };
  try {
    swReg?.active?.postMessage(payload);
    navigator.serviceWorker?.controller?.postMessage(payload);
  } catch {
    /* ignore */
  }
  if (guard.kill || guard.lockdown) {
    abortInflight();
    freezeThirdPartyAssets();
  } else {
    thawThirdPartyAssets();
  }
}

export function abortInflight() {
  inflight.forEach((c) => {
    try {
      c.abort();
    } catch {
      /* ignore */
    }
  });
  inflight.clear();
}

function freezeThirdPartyAssets() {
  if (typeof document === "undefined") return;
  document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
    const link = el as HTMLLinkElement;
    try {
      if (new URL(link.href, location.href).origin !== location.origin) {
        link.disabled = true;
        frozenLinks.add(link);
      }
    } catch {
      /* ignore */
    }
  });
}

function thawThirdPartyAssets() {
  frozenLinks.forEach((l) => {
    l.disabled = false;
  });
  frozenLinks.clear();
}

export async function probeOutbound() {
  if (typeof window === "undefined") return 0;
  const urls = [
    "https://www.gstatic.com/generate_204",
    "https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg",
    "https://httpbin.org/status/204",
  ];
  let drops = 0;
  await Promise.all(
    urls.map(async (u) => {
      try {
        await fetch(u, { cache: "no-store", mode: "cors", credentials: "omit" });
      } catch {
        drops += 1;
      }
    }),
  );
  return drops;
}

export function blockHost(host: string) {
  if (!host) return;
  blockedHosts.add(host);
  applyGuard({ ...guard, blocked: [...blockedHosts] });
}

export function blockedHostList() {
  return [...blockedHosts];
}

function shouldFail(url: URL) {
  if (url.origin === location.origin) return false;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return false;
  if (blockedHosts.has(url.hostname) || blockedHosts.has(url.host)) return "blocklist";
  if (guard.kill) return "kill";
  if (guard.lockdown) return "lockdown";
  return null;
}

function patchFetch() {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    let url: URL;
    try {
      url = new URL(raw, location.href);
    } catch {
      return orig(input, init);
    }
    const reason = shouldFail(url);
    if (reason) {
      emit({ type: "drop", host: url.host, reason, at: Date.now() });
      throw new TypeError(`Failed to fetch (${reason})`);
    }
    const ctrl = new AbortController();
    inflight.add(ctrl);
    const userSignal = init?.signal;
    if (userSignal) {
      if (userSignal.aborted) ctrl.abort();
      else userSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    try {
      return await orig(input, { ...init, signal: ctrl.signal });
    } finally {
      inflight.delete(ctrl);
    }
  };
}

function patchXhr() {
  if (xhrPatched || typeof XMLHttpRequest === "undefined") return;
  xhrPatched = true;
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    (this as XMLHttpRequest & { __kysUrl?: string }).__kysUrl = String(url);
    return origOpen.call(this, method, url, async ?? true, username, password);
  };
  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const raw = (this as XMLHttpRequest & { __kysUrl?: string }).__kysUrl;
    if (raw) {
      try {
        const url = new URL(raw, location.href);
        const reason = shouldFail(url);
        if (reason) {
          emit({ type: "drop", host: url.host, reason, at: Date.now() });
          this.abort();
          return;
        }
      } catch {
        /* ignore */
      }
    }
    return origSend.call(this, body);
  };
}

export async function unregisterGuardWorker() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    if (!regs) return;
    await Promise.all(regs.map((r) => r.unregister()));
    swReg = null;
  } catch {
    /* ignore */
  }
}

export async function registerGuardWorker() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return null;
  try {
    swReg = await navigator.serviceWorker.register("/kys-sw.js", { scope: "/" });
    const bootAt = Date.now();
    navigator.serviceWorker.addEventListener("message", (ev) => {
      const d = ev.data as GuardEvent | undefined;
      if (!d || (d.type !== "drop" && d.type !== "honeypot")) return;
      emit(d);
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (Date.now() - bootAt < 4000) return;
      emit({
        type: "tamper",
        target: "Service Worker",
        cause: "Service worker controller changed while the app was running",
        at: Date.now(),
      });
    });
    applyGuard(guard);
    return swReg;
  } catch {
    return null;
  }
}

export async function bootEngine() {
  if (typeof window === "undefined") return;
  patchFetch();
  patchXhr();
  const nativeApp = Boolean((window as unknown as { KysAndroid?: unknown }).KysAndroid);
  if (!nativeApp) await registerGuardWorker();
  try {
    const obs = new PerformanceObserver((list) => {
      longTasks = Math.min(12, longTasks + list.getEntries().length);
    });
    obs.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
  } catch {
    /* longtask not in all browsers */
  }
  window.setInterval(() => {
    longTasks = Math.max(0, longTasks - 1);
  }, 2000);
  const appOwnedStorageKeys = new Set([
    "kysmindset-v4",
    "kysmindset-v5",
    "kysmindset-webauthn",
    "kysmindset-hide-install-v2",
  ]);
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith("kysmindset")) return;
    // The storage event only fires in a different same-origin document.
    // Known Kysmindset keys are normal app synchronization, not evidence of intrusion.
    if (appOwnedStorageKeys.has(e.key)) return;
    emit({
      type: "tamper",
      target: "Kysmindset storage",
      cause: `Unexpected Kysmindset-prefixed storage key changed in another context (${e.key})`,
      at: Date.now(),
    });
  });
}

export type PostureSnap = {
  secure: boolean;
  online: boolean;
  nativeApp: boolean;
  sw: boolean;
  persisted: boolean;
  quotaMb: number;
  usedMb: number;
  thirdPartyHosts: string[];
  thirdPartyScripts: number;
  cores: number;
  deviceGb?: number;
};

export async function snapshotPosture(): Promise<PostureSnap> {
  const conn = readConnection();
  const resources = sampleResources();
  const third = resources
    .filter((r) => r.status === "suspicious" || r.status === "unknown")
    .map((r) => r.name);
  let persisted = apkStorageOn();
  let quotaMb = 0;
  let usedMb = 0;
  try {
    persisted = persisted || Boolean(await navigator.storage?.persisted?.());
    const est = await navigator.storage?.estimate?.();
    quotaMb = Math.round((est?.quota ?? 0) / 1_048_576);
    usedMb = Math.round((est?.usage ?? 0) / 1_048_576);
  } catch {
    /* file:// WebView has no persisted() */
  }
  const thirdPartyScripts =
    typeof document === "undefined"
      ? 0
      : [...document.scripts].filter((s) => {
          if (!s.src) return false;
          try {
            return new URL(s.src, location.href).origin !== location.origin;
          } catch {
            return false;
          }
        }).length;
  const nativeApp = Boolean(
    typeof window !== "undefined" && (window as unknown as { KysAndroid?: unknown }).KysAndroid,
  );
  return {
    secure: conn.secure,
    online: conn.online !== false,
    nativeApp,
    sw: Boolean(navigator.serviceWorker?.controller),
    persisted,
    quotaMb,
    usedMb,
    thirdPartyHosts: [...new Set(third)],
    thirdPartyScripts,
    cores: navigator.hardwareConcurrency || 0,
    deviceGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };
}

export async function probeDecoy(path: string) {
  const def = HONEYPOT_DEFS.find((h) => h.path === path);
  const name = def?.name ?? path;
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) {
    emit({ type: "honeypot", path, name, method: "GET", at: Date.now() });
  }
  try {
    await fetch(path, { cache: "no-store", headers: { "X-Kysmindset": "pen-test" } });
  } catch {
    /* expected when the worker fails the decoy */
  }
}

export async function queryPermissionFlags(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  if (typeof navigator === "undefined") return out;
  const map: Record<string, string> = {
    loc: "geolocation",
    cam: "camera",
    mic: "microphone",
    push: "notifications",
  };
  for (const [id, name] of Object.entries(map)) {
    try {
      const p = await navigator.permissions.query({ name: name as PermissionName });
      out[id] = p.state === "granted";
    } catch {
      if (id === "push" && typeof Notification !== "undefined") {
        out[id] = Notification.permission === "granted";
      }
    }
  }
  out.persist = apkStorageOn();
  if (!out.persist) {
    try {
      out.persist = Boolean(await navigator.storage?.persisted?.());
    } catch {
      out.persist = false;
    }
  }
  return out;
}
