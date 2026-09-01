import type { SecurityActivity } from "./types";

const MULTI_TLD = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "co.in",
  "com.br",
  "com.mx",
  "co.za",
  "com.tr",
]);

export type DomainKind = "domain" | "ip" | "local";

export interface DomainGroup {
  key: string;
  label: string;
  kind: DomainKind;
  items: SecurityActivity[];
}

function stripHost(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0] ?? s;
  s = s.split("?")[0] ?? s;
  s = s.split("#")[0] ?? s;
  s = s.replace(/:\d+$/, "");
  if (s.startsWith("[") && s.includes("]")) s = s.slice(1, s.indexOf("]"));
  if (!s || s === "localhost") return s || null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s;
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return s;
  return null;
}

export function extractHost(item: SecurityActivity): string | null {
  for (const raw of [item.destination, item.source, item.name]) {
    if (!raw) continue;
    const host = stripHost(raw);
    if (host) return host;
  }
  return null;
}

export function registrableDomain(host: string): { key: string; label: string; kind: DomainKind } {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".");
    const label = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return { key: `ip:${label}`, label, kind: "ip" };
  }
  if (host === "localhost" || !host.includes(".")) {
    return { key: `host:${host}`, label: host, kind: "local" };
  }
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const base =
    labels.length >= 3 && MULTI_TLD.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
  return { key: `d:${base}`, label: base, kind: "domain" };
}

export function groupKey(item: SecurityActivity): { key: string; label: string; kind: DomainKind } {
  const host = extractHost(item);
  if (!host) {
    if (item.type === "app") return { key: "local:app", label: "Apps", kind: "local" };
    if (item.type === "process") return { key: "local:process", label: "Processes", kind: "local" };
    return { key: "local:other", label: "Other", kind: "local" };
  }
  return registrableDomain(host);
}

export function groupByDomain(items: SecurityActivity[]): DomainGroup[] {
  const map = new Map<string, DomainGroup>();
  for (const item of items) {
    const meta = groupKey(item);
    const existing = map.get(meta.key);
    if (existing) existing.items.push(item);
    else map.set(meta.key, { ...meta, items: [item] });
  }
  return [...map.values()].sort((a, b) => {
    const aThreat = a.items.filter((i) => i.status === "suspicious" || i.status === "unknown").length;
    const bThreat = b.items.filter((i) => i.status === "suspicious" || i.status === "unknown").length;
    if (bThreat !== aThreat) return bThreat - aThreat;
    if (b.items.length !== a.items.length) return b.items.length - a.items.length;
    return a.label.localeCompare(b.label);
  });
}
