import { listDeviceApps, setVpnAllowlist, type DeviceApp } from "./native";

const VPN_ALLOW_KEY = "kysmindset-vpn-allow";

export const APP_ALIASES: { keys: string[]; name: string; pkgs: string[] }[] = [
  {
    keys: ["facebook", "fb", "face book"],
    name: "Facebook",
    pkgs: ["com.facebook.katana", "com.facebook.lite", "com.facebook.mlite", "com.facebook.orca"],
  },
  { keys: ["messenger"], name: "Messenger", pkgs: ["com.facebook.orca"] },
  { keys: ["instagram", "ig"], name: "Instagram", pkgs: ["com.instagram.android"] },
  { keys: ["whatsapp"], name: "WhatsApp", pkgs: ["com.whatsapp", "com.whatsapp.w4b"] },
  { keys: ["youtube"], name: "YouTube", pkgs: ["com.google.android.youtube"] },
  { keys: ["gmail", "mail"], name: "Gmail", pkgs: ["com.google.android.gm"] },
  { keys: ["maps", "google maps"], name: "Maps", pkgs: ["com.google.android.apps.maps"] },
  { keys: ["chrome"], name: "Chrome", pkgs: ["com.android.chrome"] },
  { keys: ["messages", "sms", "text"], name: "Messages", pkgs: ["com.google.android.apps.messaging"] },
  { keys: ["phone", "dialer", "call"], name: "Phone", pkgs: ["com.google.android.dialer", "com.samsung.android.dialer"] },
  { keys: ["twitter", "x"], name: "X", pkgs: ["com.twitter.android"] },
  { keys: ["tiktok"], name: "TikTok", pkgs: ["com.zhiliaoapp.musically"] },
  { keys: ["snapchat", "snap"], name: "Snapchat", pkgs: ["com.snapchat.android"] },
  { keys: ["spotify"], name: "Spotify", pkgs: ["com.spotify.music"] },
];

export const COMMON_APPS: DeviceApp[] = APP_ALIASES.map((a) => ({ name: a.name, pkg: a.pkgs[0] }));

export function loadVpnAllow(): DeviceApp[] {
  try {
    const raw = localStorage.getItem(VPN_ALLOW_KEY);
    const parsed = raw ? (JSON.parse(raw) as DeviceApp[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveVpnAllow(list: DeviceApp[]) {
  const uniq: DeviceApp[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    if (!a.pkg || seen.has(a.pkg)) continue;
    seen.add(a.pkg);
    uniq.push(a);
  }
  try {
    localStorage.setItem(VPN_ALLOW_KEY, JSON.stringify(uniq));
  } catch {
    /* ignore */
  }
  setVpnAllowlist(uniq.map((a) => a.pkg));
  return uniq;
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveTypedApp(query: string): DeviceApp[] {
  const q = norm(query);
  if (!q) return [];
  const installed = listDeviceApps();
  const hits: DeviceApp[] = [];

  for (const a of installed) {
    const n = norm(a.name);
    const p = a.pkg.toLowerCase();
    if (n.includes(q) || p.includes(q.replace(/\s+/g, ".")) || p.includes(q.replace(/\s+/g, ""))) {
      hits.push(a);
    }
  }

  for (const alias of APP_ALIASES) {
    const matched = alias.keys.some((k) => {
      const kn = norm(k);
      return q === kn || q.startsWith(kn) || kn.startsWith(q) || q.includes(kn);
    });
    if (!matched) continue;
    const onPhone = installed.filter(
      (a) =>
        alias.pkgs.includes(a.pkg) ||
        alias.keys.some((k) => norm(a.name).includes(norm(k))),
    );
    if (onPhone.length) hits.push(...onPhone);
    else hits.push({ name: alias.name, pkg: alias.pkgs[0] });
    for (const pkg of alias.pkgs) {
      const found = installed.find((a) => a.pkg === pkg);
      if (found && !hits.some((h) => h.pkg === pkg)) hits.push(found);
    }
  }

  const uniq: DeviceApp[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (seen.has(h.pkg)) continue;
    seen.add(h.pkg);
    uniq.push(h);
  }
  return uniq;
}

export function addTypedVpnAllow(query: string): DeviceApp[] {
  return saveVpnAllow([...loadVpnAllow(), ...resolveTypedApp(query)]);
}

export function toggleVpnAllow(app: DeviceApp, on: boolean): DeviceApp[] {
  const cur = loadVpnAllow();
  const next = on ? [...cur, app] : cur.filter((a) => a.pkg !== app.pkg);
  return saveVpnAllow(next);
}
