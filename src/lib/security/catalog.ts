import type { DecoyType, Permission, Severity } from "./types";

export const PORTS: Record<
  number,
  { name: string; desc: string; risk: "low" | "medium" | "high" }
> = {
  80: { name: "HTTP", desc: "Unencrypted web traffic", risk: "medium" },
  443: { name: "HTTPS", desc: "Encrypted web traffic", risk: "low" },
  8080: { name: "HTTP Alt", desc: "Alternate HTTP port", risk: "medium" },
  8443: { name: "HTTPS Alt", desc: "Alternate HTTPS port", risk: "low" },
};

export const TRACKER_HOSTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "googleadservices.com",
  "doubleclick.net",
  "facebook.net",
  "facebook.com",
  "connect.facebook.net",
  "scorecardresearch.com",
  "hotjar.com",
  "mixpanel.com",
  "segment.io",
  "sentry.io",
  "clarity.ms",
  "ads-twitter.com",
  "adsystem.com",
];

export const PROTECTED_NAMES = ["Kysmindset", "Service Worker", "Browser runtime hints"];

export function isProtectedName(name: string) {
  return PROTECTED_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

export const HONEYPOT_DEFS: {
  name: string;
  decoyType: DecoyType;
  description: string;
  severity: Severity;
  path: string;
}[] = [
  {
    name: "Decoy shell",
    decoyType: "ssh",
    path: "/decoy/ssh",
    description: "Logs GET/POST to /decoy/ssh on this origin",
    severity: "high",
  },
  {
    name: "Decoy admin",
    decoyType: "admin",
    path: "/decoy/admin",
    description: "Logs probes to /decoy/admin",
    severity: "critical",
  },
  {
    name: "Decoy secrets",
    decoyType: "credentials",
    path: "/decoy/credentials",
    description: "Logs probes to /decoy/credentials",
    severity: "high",
  },
  {
    name: "Decoy database",
    decoyType: "mysql",
    path: "/decoy/mysql",
    description: "Logs probes to /decoy/mysql",
    severity: "medium",
  },
  {
    name: "Decoy backup API",
    decoyType: "ftp",
    path: "/decoy/ftp",
    description: "Logs probes to /decoy/ftp",
    severity: "medium",
  },
];

export const DEFAULT_PERMISSIONS: Permission[] = [
  { id: "loc", name: "Location", description: "Device GPS", granted: false, risk: "high" },
  { id: "cam", name: "Camera", description: "Device camera", granted: false, risk: "high" },
  { id: "mic", name: "Microphone", description: "Device microphone", granted: false, risk: "high" },
  { id: "push", name: "Notifications", description: "System notifications", granted: false, risk: "low" },
  { id: "clip-r", name: "Clipboard Read", description: "Reads copied data", granted: false, risk: "medium" },
  { id: "clip-w", name: "Clipboard Write", description: "Writes to clipboard", granted: false, risk: "low" },
  { id: "persist", name: "Storage", description: "App data and media access", granted: true, risk: "low" },
];
