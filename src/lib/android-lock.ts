export type OwnerStatus = {
  android: boolean;
  owner: boolean;
  admin: boolean;
  lockTask: boolean;
  pinOnLock: boolean;
  keyguardOff: boolean;
  replaceKeyguard: boolean;
  adb: string;
  component: string;
};

export type AppVersion = {
  android: boolean;
  code: number;
  name: string;
};

export type UpdateEvent = {
  state: string;
  local?: number;
  remote?: number;
  name?: string;
  published?: string;
  updated?: string;
  url?: string;
  pct?: number;
  error?: string;
};

type LockBridge = {
  setGate?: (locked: boolean) => void;
  setDeviceLock?: (on: boolean) => void;
  ownerStatus?: () => string;
  requestAdmin?: () => void;
  applyOwner?: (replaceKeyguard: boolean) => string;
  applyPin?: (on: boolean) => string;
  pinNow?: () => void;
  lockNow?: () => void;
  removeAdmin?: () => string;
  appVersion?: () => string;
  checkUpdate?: () => void;
  startUpdate?: () => void;
};

function bridge(): LockBridge | null {
  return (window as unknown as { KysAndroid?: LockBridge }).KysAndroid ?? null;
}

export function isAndroidApp() {
  return bridge() != null;
}

export function setAndroidGate(locked: boolean) {
  try {
    bridge()?.setGate?.(locked);
  } catch {
    /* ignore */
  }
}

export function setAndroidDeviceLock(on: boolean) {
  try {
    bridge()?.setDeviceLock?.(on);
  } catch {
    /* ignore */
  }
}

export function readOwnerStatus(): OwnerStatus | null {
  const b = bridge();
  if (!b?.ownerStatus) return null;
  try {
    const parsed = JSON.parse(b.ownerStatus()) as OwnerStatus;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function requestAndroidAdmin() {
  try {
    bridge()?.requestAdmin?.();
  } catch {
    /* ignore */
  }
}

export function applyAndroidOwner(replaceKeyguard: boolean): OwnerStatus | null {
  const b = bridge();
  if (!b?.applyOwner) return readOwnerStatus();
  try {
    const parsed = JSON.parse(b.applyOwner(replaceKeyguard)) as OwnerStatus;
    return parsed && typeof parsed === "object" ? parsed : readOwnerStatus();
  } catch {
    return readOwnerStatus();
  }
}

export function applyAndroidPin(on: boolean): OwnerStatus | null {
  const b = bridge();
  if (!b?.applyPin) return readOwnerStatus();
  try {
    const parsed = JSON.parse(b.applyPin(on)) as OwnerStatus;
    return parsed && typeof parsed === "object" ? parsed : readOwnerStatus();
  } catch {
    return readOwnerStatus();
  }
}

export function androidPinNow() {
  try {
    bridge()?.pinNow?.();
  } catch {
    /* ignore */
  }
}

export function androidLockNow() {
  try {
    bridge()?.lockNow?.();
  } catch {
    /* ignore */
  }
}

export function removeAndroidAdmin(): OwnerStatus | null {
  const b = bridge();
  if (!b?.removeAdmin) return readOwnerStatus();
  try {
    const parsed = JSON.parse(b.removeAdmin()) as OwnerStatus;
    return parsed && typeof parsed === "object" ? parsed : readOwnerStatus();
  } catch {
    return readOwnerStatus();
  }
}

export function readAppVersion(): AppVersion | null {
  const b = bridge();
  if (!b?.appVersion) return null;
  try {
    const parsed = JSON.parse(b.appVersion()) as AppVersion;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function checkAndroidUpdate() {
  try {
    bridge()?.checkUpdate?.();
  } catch {
    /* ignore */
  }
}

export function startAndroidUpdate() {
  try {
    bridge()?.startUpdate?.();
  } catch {
    /* ignore */
  }
}

export function subscribeAndroidUpdate(fn: (e: UpdateEvent) => void) {
  const on = (ev: Event) => {
    const raw = String((ev as CustomEvent).detail ?? "");
    try {
      const parsed = JSON.parse(raw) as UpdateEvent;
      if (parsed && typeof parsed === "object") fn(parsed);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("kys-update", on);
  return () => window.removeEventListener("kys-update", on);
}
