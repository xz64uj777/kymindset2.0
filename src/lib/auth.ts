type AndroidAuthBridge = {
  hasPin?: () => boolean;
  verifyPin?: (pin: string) => boolean;
  setAuthPin?: (pin: string) => boolean;
  pinRetryAfterMs?: () => number;
};

const FALLBACK_KEY = "kysmindset_auth_v1";
const ITERATIONS = 120_000;

function bridge(): AndroidAuthBridge | null {
  return (window as unknown as { KysAndroid?: AndroidAuthBridge }).KysAndroid ?? null;
}

function bytesToB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(s: string) {
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function authConfigured() {
  const a = bridge();
  if (a?.hasPin) {
    try { return Boolean(a.hasPin()); } catch { return false; }
  }
  try { return Boolean(localStorage.getItem(FALLBACK_KEY)); } catch { return false; }
}

export async function setAuthPin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) return false;
  const a = bridge();
  if (a?.setAuthPin) {
    try { return Boolean(a.setAuthPin(pin)); } catch { return false; }
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  localStorage.setItem(FALLBACK_KEY, JSON.stringify({
    salt: bytesToB64(salt),
    hash: bytesToB64(hash),
    iterations: ITERATIONS,
    assurance: "browser-fallback",
  }));
  return true;
}

export async function verifyAuthPin(pin: string) {
  const a = bridge();
  if (a?.verifyPin) {
    try {
      const ok = Boolean(a.verifyPin(pin));
      const retryAfterMs = a.pinRetryAfterMs ? Number(a.pinRetryAfterMs()) || 0 : 0;
      return { ok, retryAfterMs, assurance: "native" as const };
    } catch {
      return { ok: false, retryAfterMs: 0, assurance: "native" as const };
    }
  }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return { ok: false, retryAfterMs: 0, assurance: "browser" as const };
    const parsed = JSON.parse(raw) as { salt: string; hash: string };
    const actual = await derive(pin, b64ToBytes(parsed.salt));
    const ok = equal(actual, b64ToBytes(parsed.hash));
    return { ok, retryAfterMs: 0, assurance: "browser" as const };
  } catch {
    return { ok: false, retryAfterMs: 0, assurance: "browser" as const };
  }
}
