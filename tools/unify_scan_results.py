from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))

# Store: add a deliberately scoped Auto Fix action.
replace_once(
    "src/lib/security/store.ts",
    "  resolveAllThreats: () => void;\n  clearResolved: () => void;\n",
    "  resolveAllThreats: () => void;\n  autoFixScan: () => { fixed: number; manual: number };\n  clearResolved: () => void;\n",
)
replace_once(
    "src/lib/security/store.ts",
    "        tamperProtection: true,\n        autoLockdown: true,\n",
    "        tamperProtection: true,\n        autoLockdown: false,\n",
)

# A scan reports evidence. It does not silently remediate based on a persisted automation flag.
replace_once(
    "src/lib/security/store.ts",
    '''          if (get().settings.autoLockdown) {
            for (const host of snap.thirdPartyHosts) {
              if (get().activities.some((a) => a.name === host && a.status === "suspicious")) {
                const row = get().activities.find((a) => a.name === host);
                if (row) get().block(row.id, "Blocked by scan (tracker)");
              }
            }
          }
''',
    '''          // Analysis is evidence-only. Remediation is chosen from Scan Results.
''',
)

# Bulk block is now limited to confirmed suspicious findings, never unknown/review evidence.
replace_once(
    "src/lib/security/store.ts",
    '''      resolveAllThreats: () => {
        const n = get().activities.filter(
          (a) => a.status === "suspicious" || a.status === "unknown",
        ).length;
        set({
          activities: get().activities.map((a) =>
            a.status === "suspicious" || a.status === "unknown"
              ? { ...a, status: "blocked" as const, resolveNote: "Blocked automatically" }
              : a,
          ),
          history: pushHistory(
            get().history,
            "Block all threats",
            `${n} items`,
            "All suspicious items blocked.",
          ),
        });
      },
''',
    '''      resolveAllThreats: () => {
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
''',
)

# Config: remove the conflicting automatic remediation toggle from the visible UI.
replace_once(
    "src/components/security/config-panel.tsx",
    '''          <ToggleRow
            title="Auto-Lockdown"
            desc="Automatically block known tracker findings discovered during analysis"
            checked={settings.autoLockdown}
            onChange={(v) => patch({ autoLockdown: v })}
          />
''',
    "",
)

# Overview: reuse the existing per-finding controls directly inside the post-scan result surface.
replace_once(
    "src/components/security/overview-panel.tsx",
    'import { Panel, PanelHeader, ScoreTone, StatusDot } from "./chrome";\n',
    'import { Panel, PanelHeader, ScoreTone, StatusDot } from "./chrome";\nimport { ActivityRow } from "./activity-row";\n',
)
replace_once(
    "src/components/security/overview-panel.tsx",
    '''  const scanLog = useSecurity((s) => s.scanLog);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const setTab = useSecurity((s) => s.setTab);
''',
    '''  const scanLog = useSecurity((s) => s.scanLog);
  const killSwitch = useSecurity((s) => s.killSwitch);
  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);
  const deepScan = useSecurity((s) => s.deepScan);
  const deepScanning = useSecurity((s) => s.deepScanning);
  const runDeepScan = useSecurity((s) => s.runDeepScan);
  const autoFixScan = useSecurity((s) => s.autoFixScan);
  const setTab = useSecurity((s) => s.setTab);
''',
)
replace_once(
    "src/components/security/overview-panel.tsx",
    '''  const threats = activities.filter((a) => a.status === "suspicious");
  const blocked = activities.filter((a) => a.status === "blocked" || a.status === "killed");
  const allowed = activities.filter((a) => a.status === "allowed");
''',
    '''  const threats = activities.filter((a) => a.status === "suspicious");
  const reviewItems = activities.filter((a) => a.status === "unknown");
  const openItems = [...threats, ...reviewItems];
  const blocked = activities.filter((a) => a.status === "blocked" || a.status === "killed");
  const allowed = activities.filter((a) => a.status === "allowed");
  const autoFixable =
    threats.filter((a) => a.type === "traffic").length +
    honeypots.filter((h) => !h.armed).length +
    Number(!settings.tamperProtection);
  const weakenedCount = deepScan?.vulnerabilities.length ?? 0;
  const scanHeadline = threats.length
    ? "Alerts found"
    : reviewItems.length || weakenedCount
      ? "Protection weakened"
      : "No action needed";
''',
)

# Remove the bouncing four-button mindset navigation panel.
old_mindset = '''      <Panel>
        <PanelHeader icon={<Radar className="size-4" />} title="Mindset" subtitle="Observe → verify → control → recover" />
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            {
              title: "Observe",
              detail: "Collect only what this app or Android can actually see.",
              action: scanning ? "Analyzing…" : "Run analysis",
              disabled: scanning,
              onClick: () => {
                void runSecurityAnalysis();
                window.setTimeout(() => scrollToPanel("Security Analysis Engine"), 60);
              },
            },
            {
              title: "Verify",
              detail: "Unknown means review — never automatically malware.",
              action: "Review network",
              disabled: false,
              onClick: () => {
                setTab("network");
                toast.message("Review unknown and suspicious network activity before deciding.");
              },
            },
            {
              title: "Control",
              detail: "Choose allow, block, protection, or emergency containment deliberately.",
              action: "Open controls",
              disabled: false,
              onClick: () => {
                setTab("network");
                toast.message("Controls opened — review the evidence, then choose Allow, Block, End, or emergency protection.");
              },
            },
            {
              title: "Recover",
              detail: "Return to a known-good state without silently disabling protection.",
              action: "Recovery actions",
              disabled: false,
              onClick: () => {
                scrollToPanel("Actions");
                toast.message("Recovery actions are below: release protection, clear resolved items, or refresh monitors.");
              },
            },
          ].map(({ title, detail, action, disabled, onClick }) => (
            <button
              key={title}
              type="button"
              disabled={disabled}
              onClick={onClick}
              className="rounded-md border border-line bg-elevated p-3 text-left transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="text-xs font-semibold text-fg">{title}</div>
              <div className="mt-1 text-2xs leading-relaxed text-subtle">{detail}</div>
              <div className="mt-2 text-2xs font-medium text-cyan">{action} →</div>
            </button>
          ))}
        </div>
      </Panel>
'''
replace_once("src/components/security/overview-panel.tsx", old_mindset, "")

replace_once(
    "src/components/security/overview-panel.tsx",
    '''        <PanelHeader icon={<Radar className="size-4" />} title="Security Analysis Engine" subtitle="Rule-based posture analysis" />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void runSecurityAnalysis()} disabled={scanning}>
            {scanning ? "Scanning..." : "Run Security Analysis"}
          </Button>
''',
    '''        <PanelHeader icon={<Radar className="size-4" />} title="Security Scan" subtitle="Scan first; decide from one result screen" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              void runSecurityAnalysis().then(() => {
                runDeepScan();
                window.setTimeout(() => scrollToPanel("Scan Results"), 100);
              });
            }}
            disabled={scanning || deepScanning}
          >
            {scanning ? "Scanning..." : "Run Security Scan"}
          </Button>
''',
)

results_panel = '''      {lastScan ? (
        <Panel>
          <PanelHeader
            icon={<ShieldAlert className="size-4" />}
            title="Scan Results"
            subtitle="Everything that needs a decision stays here"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Status</div>
              <div className={cn("mt-1 text-sm font-semibold", threats.length ? "text-rose" : reviewItems.length || weakenedCount ? "text-amber" : "text-emerald")}>
                {scanHeadline}
              </div>
            </div>
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Alerts</div>
              <div className={cn("mt-1 text-sm font-semibold", threats.length ? "text-rose" : "text-emerald")}>{threats.length}</div>
            </div>
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Needs review / weakened</div>
              <div className={cn("mt-1 text-sm font-semibold", reviewItems.length || weakenedCount ? "text-amber" : "text-emerald")}>
                {reviewItems.length + weakenedCount}
              </div>
            </div>
          </div>

          {deepScanning ? <p className="mt-3 text-xs text-muted">Building the final posture summary…</p> : null}

          {openItems.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-fg">Alerts & review items</div>
              {openItems.slice(0, 4).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
              {openItems.length > 4 ? (
                <button type="button" onClick={() => setTab("network")} className="text-xs font-medium text-cyan hover:underline">
                  Review all {openItems.length} manually →
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-emerald/20 bg-emerald-dim/30 px-3 py-2 text-xs text-emerald">
              No open network findings need a decision.
            </p>
          )}

          {deepScan?.vulnerabilities.length ? (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-fg">Weakened areas</div>
              <div className="space-y-1.5">
                {deepScan.vulnerabilities.slice(0, 5).map((v) => (
                  <div key={`${v.name}-${v.severity}`} className="flex items-start justify-between gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-xs">
                    <span className="text-muted">{v.name}</span>
                    <span className="shrink-0 uppercase text-2xs text-amber">{v.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={autoFixable === 0}
              onClick={() => {
                const result = autoFixScan();
                runDeepScan();
                if (result.fixed) {
                  toast.success(`Auto Fix corrected ${result.fixed} safe item${result.fixed === 1 ? "" : "s"}.${result.manual ? ` ${result.manual} still need manual review.` : ""}`);
                } else {
                  toast.message("No safe automatic fixes are available for the remaining items.");
                }
              }}
            >
              Auto Fix{autoFixable ? ` (${autoFixable})` : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTab("network")} disabled={openItems.length === 0}>
              Review all manually
            </Button>
          </div>
          <p className="mt-2 text-2xs text-subtle">
            Auto Fix only changes reversible Kymindset-owned controls and blocks confirmed tracker findings. Unknown hosts, Android settings, root/debugger signals, and emergency lockdown remain manual.
          </p>
        </Panel>
      ) : null}
'''
replace_once(
    "src/components/security/overview-panel.tsx",
    '''      <Panel>
        <PanelHeader icon={<Terminal className="size-4" />} title="Live feed" subtitle="Engine output while a scan runs" />
''',
    results_panel + '''      <Panel>
        <PanelHeader icon={<Terminal className="size-4" />} title="Live feed" subtitle="Engine output while a scan runs" />
''',
)

# Quick action wording: don't call unknown/review evidence a threat.
replace_once(
    "src/components/security/overview-panel.tsx",
    '      label: "Block open items",\n      desc: pending.length ? "Cut everything still waiting" : "Nothing waiting",\n',
    '      label: "Block confirmed findings",\n      desc: threats.length ? "Block confirmed suspicious items" : "No confirmed findings",\n',
)
replace_once(
    "src/components/security/overview-panel.tsx",
    '      disabled: pending.length === 0,\n',
    '      disabled: threats.length === 0,\n',
)

# QuickActions needs its own confirmed-finding count.
replace_once(
    "src/components/security/overview-panel.tsx",
    '''  const pending = activities.filter((a) => a.status === "suspicious" || a.status === "unknown");
  const resolved = activities.filter(
''',
    '''  const pending = activities.filter((a) => a.status === "suspicious" || a.status === "unknown");
  const threats = activities.filter((a) => a.status === "suspicious");
  const resolved = activities.filter(
''',
)

# Contract coverage for the unified post-scan decision flow.
tests = Path("tests/security-contract.test.mjs")
t = tests.read_text()
append = '''\n\ntest("security scan is evidence-only until the user chooses remediation", () => {\n  const store = read("src/lib/security/store.ts");\n  const start = store.indexOf("runSecurityAnalysis: async");\n  const end = store.indexOf("runDeepScan:", start);\n  assert.ok(start >= 0 && end > start);\n  const scan = store.slice(start, end);\n  assert.doesNotMatch(scan, /settings\.autoLockdown/);\n  assert.doesNotMatch(scan, /Blocked by scan/);\n});\n\ntest("post-scan results keep auto-fix and manual decisions together", () => {\n  const overview = read("src/components/security/overview-panel.tsx");\n  assert.match(overview, /title="Scan Results"/);\n  assert.match(overview, /Auto Fix/);\n  assert.match(overview, /Review all manually/);\n  assert.match(overview, /<ActivityRow key=/);\n  assert.match(overview, /Unknown hosts, Android settings, root\/debugger signals, and emergency lockdown remain manual/);\n});\n\ntest("auto-fix only targets confirmed traffic and reversible app controls", () => {\n  const store = read("src/lib/security/store.ts");\n  const start = store.indexOf("autoFixScan: () =>");\n  const end = store.indexOf("clearResolved:", start);\n  assert.ok(start >= 0 && end > start);\n  const fix = store.slice(start, end);\n  assert.match(fix, /a\.type === "traffic" && a\.status === "suspicious"/);\n  assert.match(fix, /tamperProtection: true/);\n  assert.match(fix, /armed: true/);\n  assert.doesNotMatch(fix, /toggleLockdown/);\n  assert.doesNotMatch(fix, /toggleKillSwitch/);\n});\n'''
if 'post-scan results keep auto-fix and manual decisions together' not in t:
    tests.write_text(t + append)
