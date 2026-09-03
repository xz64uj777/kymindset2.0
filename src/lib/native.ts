const BIO_KEY = "kysmindset-webauthn";
const HIDE_INSTALL_KEY = "kysmindset-hide-install-v2";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredInstall: InstallEvent | null = null;
const installListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (isPreviewShell()) return;
    deferredInstall = e as InstallEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installListeners.forEach((fn) => fn());
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isInFrame() {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isPreviewShell() {
  if (typeof window === "undefined") return false;
  if (isInFrame()) return true;
  const host = window.location.hostname.toLowerCase();
  return (
    host === "grok-sandbox.com" ||
    host.endsWith(".grok-sandbox.com") ||
    host.includes(".preview.")
  );
}

export function vibrate(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

export function notify(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.svg", tag: "kysmindset", silent: false });
  } catch {
    /* ignore */
  }
}

export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    /* ignore */
  }
}

type AndroidBridge = {
  setKill?: (v: boolean) => void;
  biometric?: () => void;
  listApps?: () => string;
  setAllowlist?: (json: string) => void;
  requestStorage?: () => void;
  vpnActive?: () => boolean;
  devicePosture?: () => string;
};

function androidBridge(): AndroidBridge | null {
  const a = (window as unknown as { KysAndroid?: AndroidBridge }).KysAndroid;
  return a ?? null;
}

let nativePromptUntil = 0;

function beginNativePrompt(ms = 120_000) {
  nativePromptUntil = Math.max(nativePromptUntil, Date.now() + ms);
}

function endNativePromptSoon() {
  window.setTimeout(() => {
    nativePromptUntil = 0;
  }, 5000);
}

export function isNativePromptActive() {
  return Date.now() < nativePromptUntil;
}

export type DeviceApp = { pkg: string; name: string };

export type DevicePosture = {
  android: boolean;
  api: number;
  release: string;
  securityPatch: string;
  manufacturer: string;
  model: string;
  debuggable: boolean;
  debuggerAttached: boolean;
  deviceSecure: boolean;
  biometricAvailable: boolean;
  developerOptionsEnabled: boolean;
  adbEnabled: boolean;
  notificationsEnabled: boolean;
  batteryOptimized: boolean;
  rootSignals: boolean;
  rootEvidence: string[];
  emulatorSignals: boolean;
  emulatorEvidence: string[];
  vpnActive: boolean;
  vpnDesired: boolean;
  vpnDesired: boolean;
  vpnDesired: boolean;
  deviceAdmin: boolean;
  deviceOwner: boolean;
  lockTaskPermitted: boolean;
  packageName: string;
};

export function readDevicePosture(): DevicePosture | null {
  const a = androidBridge();
  if (!a?.devicePosture) return null;
  try {
    const parsed = JSON.parse(a.devicePosture()) as DevicePosture;
    return parsed && parsed.android ? parsed : null;
  } catch {
    return null;
  }
}

export function listDeviceApps(): DeviceApp[] {
  const a = androidBridge();
  if (!a?.listApps) return [];
  try {
    const raw = a.listApps();
    const parsed = JSON.parse(raw) as DeviceApp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


export function isDeviceVpnActive(): boolean | null {
  const a = androidBridge();
  if (!a?.vpnActive) return null;
  try {
    return Boolean(a.vpnActive());
  } catch {
    return null;
  }
}

export function setVpnAllowlist(pkgs: string[]) {
  const a = androidBridge();
  if (!a?.setAllowlist) return;
  try {
    a.setAllowlist(JSON.stringify(pkgs));
  } catch {
    /* ignore */
  }
}

export async function setDeviceKill(
  on: boolean,
): Promise<"on" | "off" | "denied" | "app"> {
  const android = androidBridge();
  if (!android || typeof android.setKill !== "function") return "app";
  const setKill = android.setKill.bind(android);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: "on" | "off" | "denied" | "app") => {
      if (done) return;
      done = true;
      endNativePromptSoon();
      resolve(v);
    };
    const onEvt = (e: Event) => {
      const d = String((e as CustomEvent).detail ?? "");
      if (d === "on" || d === "off" || d === "denied") finish(d);
      else finish("denied");
    };
    window.addEventListener("kys-kill", onEvt, { once: true });
    try {
      if (on) beginNativePrompt();
      setKill(on);
    } catch {
      finish("denied");
      return;
    }
    window.setTimeout(() => finish(on ? "denied" : "off"), 120_000);
  });
}

export async function requestWakeLock() {
  try {
    return (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    return null;
  }
}

export function subscribeInstall(fn: () => void) {
  installListeners.add(fn);
  return () => {
    installListeners.delete(fn);
  };
}

export function canPromptInstall() {
  return deferredInstall != null;
}

export async function promptInstall() {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const choice = await deferredInstall.userChoice;
  deferredInstall = null;
  installListeners.forEach((fn) => fn());
  return choice.outcome === "accepted";
}

export function hideInstallBanner() {
  try {
    localStorage.setItem(HIDE_INSTALL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function installBannerHidden() {
  try {
    return localStorage.getItem(HIDE_INSTALL_KEY) === "1";
  } catch {
    return false;
  }
}

export type NativeGrant = { granted: boolean; mode: "device" | "app"; detail?: string };

export async function requestNative(id: string): Promise<NativeGrant> {
  const appFallback = (detail: string): NativeGrant => ({
    granted: true,
    mode: "app",
    detail,
  });

  try {
    switch (id) {
      case "loc": {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("unsupported"));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 6000,
            maximumAge: 60_000,
          });
        });
        const label = `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`;
        try {
          sessionStorage.setItem("kysmindset-geo", label);
        } catch {
          /* ignore */
        }
        return { granted: true, mode: "device", detail: label };
      }
      case "cam": {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach((t) => t.stop());
        return { granted: true, mode: "device", detail: "Camera probe ok" };
      }
      case "mic": {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((t) => t.stop());
        return { granted: true, mode: "device", detail: "Microphone probe ok" };
      }
      case "push": {
        if (typeof Notification === "undefined") return appFallback("Notifications unavailable");
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          notify("Kysmindset", "Threat alerts will appear on this device.");
          return { granted: true, mode: "device" };
        }
        if (perm === "denied" && !isInFrame()) return { granted: false, mode: "device" };
        return appFallback("In-app alerts enabled");
      }
      case "clip-r": {
        await navigator.clipboard.readText();
        return { granted: true, mode: "device" };
      }
      case "clip-w": {
        await navigator.clipboard.writeText("Kysmindset");
        return { granted: true, mode: "device" };
      }
      case "persist": {
        try {
          await navigator.storage?.persist?.();
        } catch {
          /* file:// WebView rejects persist; app storage still works */
        }
        return { granted: true, mode: "device", detail: "App storage on" };
      }
      default:
        return { granted: true, mode: "app" };
    }
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (id === "persist") return { granted: true, mode: "device", detail: "App storage on" };
    if (name === "NotAllowedError" && !isInFrame()) {
      return { granted: false, mode: "device", detail: "Denied by the device" };
    }
    return appFallback("Enabled inside Kysmindset");
  }
}

export function lastGeoLabel() {
  try {
    return sessionStorage.getItem("kysmindset-geo");
  } catch {
    return null;
  }
}

export async function hasPlatformAuth() {
  try {
    return Boolean(
      window.PublicKeyCredential &&
        (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()),
    );
  } catch {
    return false;
  }
}

function bytes(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export async function verifyBiometric(): Promise<"ok" | "fail" | "unavailable"> {
  const android = (window as unknown as { KysAndroid?: { biometric: () => void } }).KysAndroid;
  if (android && typeof android.biometric === "function") {
    const result = new Promise<"ok" | "fail" | "unavailable">((resolve) => {
      let done = false;
      const finish = (v: "ok" | "fail" | "unavailable") => {
        if (done) return;
        done = true;
        resolve(v);
      };
      const on = (e: Event) => {
        const d = String((e as CustomEvent).detail ?? "");
        endNativePromptSoon();
        finish(d === "ok" || d === "unavailable" ? d : "fail");
      };
      window.addEventListener("kys-bio", on, { once: true });
      window.setTimeout(() => {
        window.removeEventListener("kys-bio", on);
        finish("fail");
      }, 90_000);
    });
    try {
      beginNativePrompt(90_000);
      android.biometric();
    } catch {
      return "unavailable";
    }
    return result;
  }

  if (!(await hasPlatformAuth())) return "unavailable";
  const rpId = window.location.hostname;
  let credId: ArrayBuffer | null = null;
  try {
    const saved = localStorage.getItem(BIO_KEY);
    if (saved) credId = Uint8Array.from(JSON.parse(saved) as number[]).buffer;
  } catch {
    credId = null;
  }

  try {
    if (!credId) {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: bytes(32),
          rp: { name: "Kysmindset", id: rpId },
          user: {
            id: bytes(16),
            name: "operator",
            displayName: "Operator",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) return "fail";
      localStorage.setItem(BIO_KEY, JSON.stringify([...new Uint8Array(cred.rawId)]));
      return "ok";
    }
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: bytes(32),
        timeout: 60_000,
        userVerification: "required",
        rpId,
        allowCredentials: [{ type: "public-key", id: credId }],
      },
    });
    return got ? "ok" : "fail";
  } catch {
    return isInFrame() ? "unavailable" : "fail";
  }
}
