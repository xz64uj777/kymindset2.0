export type ActivityType = "traffic" | "app" | "process";
export type ActivityStatus =
  | "allowed"
  | "blocked"
  | "suspicious"
  | "unknown"
  | "resolved"
  | "killed"
  | "paused";
export type Direction = "inbound" | "outbound";
export type DecoyType = "ssh" | "admin" | "credentials" | "mysql" | "ftp";
export type Severity = "low" | "medium" | "high" | "critical";
export type TabId =
  | "overview"
  | "alerts"
  | "network"
  | "system"
  | "intel"
  | "config"
  | "honeypot"
  | "timeline"
  | "posture"
  | "history";

export const LEGACY_TABS: Record<string, TabId> = {
  alerts: "network",
  intel: "system",
  honeypot: "system",
  timeline: "system",
  posture: "system",
  history: "system",
};

export type IntelSection = "runtime" | "timeline" | "posture" | "history" | "honeypot";

export interface SecurityActivity {
  id: string;
  type: ActivityType;
  name: string;
  status: ActivityStatus;
  createdAt: number;
  details: string;
  destination?: string;
  source?: string;
  destinationPort?: number;
  sourcePort?: number;
  protocol?: string;
  direction?: Direction;
  dataKb?: number;
  cpu?: number;
  memoryMb?: number;
  resolvedAt?: number;
  resolveNote?: string;
  prevStatus?: ActivityStatus;
  prevCpu?: number;
}

export interface TamperEvent {
  id: string;
  at: number;
  target: string;
  action: "kill" | "pause" | "stop-monitor";
  actor: "user" | "intruder";
  cause: string;
}

export interface Honeypot {
  id: string;
  name: string;
  decoyType: DecoyType;
  description: string;
  severity: Severity;
  armed: boolean;
  path: string;
}

export interface Intrusion {
  id: string;
  honeypotId: string;
  honeypotName: string;
  source: string;
  payload: string;
  at: number;
  autoBlocked: boolean;
}

export interface Indicator {
  id: string;
  value: string;
  kind: "host" | "path";
  reasoning: string;
  at: number;
}

export interface AllowItem {
  id: string;
  name: string;
  type: ActivityType;
}

export interface VpnApp {
  pkg: string;
  name: string;
}

export interface Settings {
  alwaysOn: boolean;
  autoRestart: boolean;
  tamperProtection: boolean;
  autoLockdown: boolean;
  slackAlerts: boolean;
  autoScanMin: number;
  pin: string; // legacy UI field; never persist or use as an auth verifier
  autoLock: boolean;
  deviceLock?: boolean;
}

export interface Attempt {
  key: string;
  count: number;
  lastAt: number;
  cooldownUntil?: number;
}

export interface ScanEvent {
  id: string;
  at: number;
  message: string;
  kind: "info" | "threat" | "ok" | "learn";
}

export interface HistoryItem {
  id: string;
  at: number;
  action: string;
  target: string;
  detail: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  granted: boolean;
  risk: "low" | "medium" | "high";
}

export interface DeepScanResult {
  assessment: string;
  vulnerabilities: { name: string; severity: string }[];
  recommendations: { action: string; priority: string }[];
  strengths: string[];
}

export interface ScoreBreakdown {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  status: "excellent" | "fair" | "at_risk" | "critical";
  label: string;
  factors: { label: string; deduction: number }[];
}

export interface ConnectionInfo {
  effectiveType: string;
  secure: boolean;
  saveData: boolean;
  downlink?: number;
  rtt?: number;
  online?: boolean;
}
