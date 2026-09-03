from pathlib import Path

OVERVIEW = Path('src/components/security/overview-panel.tsx')
TESTS = Path('tests/security-contract.test.mjs')

text = OVERVIEW.read_text()

old_scan_tail = '''        <p className="mt-3 text-micro text-muted">
          Always On {settings.alwaysOn ? "on" : "off"} · {honeypots.filter((h) => h.armed).length} decoys ·{" "}
          {connection.secure ? "Secure" : "Insecure"} link
          {killSwitch ? " · Network guard" : ""} · {allowlist.length} trusted · {indicators.length} learned indicators
        </p>
      </Panel>
      {lastScan ? (
'''
new_scan_tail = '''        <p className="mt-3 text-micro text-muted">
          Always On {settings.alwaysOn ? "on" : "off"} · {honeypots.filter((h) => h.armed).length} decoys ·{" "}
          {connection.secure ? "Secure" : "Insecure"} link
          {killSwitch ? " · Network guard" : ""} · {allowlist.length} trusted · {indicators.length} learned indicators
        </p>
        <div
          className={cn(
            "mt-4 rounded-lg border p-3 transition-colors",
            scanning || deepScanning
              ? "border-amber/35 bg-amber-dim/10"
              : "border-line bg-elevated/40",
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted" />
              <span className="text-xs font-semibold text-fg">Live scan</span>
            </div>
            <span
              className={cn(
                "text-2xs font-medium uppercase tracking-wide",
                scanning || deepScanning ? "text-amber" : "text-subtle",
              )}
            >
              {scanning ? "Analyzing" : deepScanning ? "Summarizing" : scanLog.length ? "Last scan log" : "Ready"}
            </span>
          </div>
          <ScanFeed log={scanLog} scanning={scanning || deepScanning} />
        </div>
      </Panel>
      {lastScan ? (
'''
if old_scan_tail not in text:
    raise SystemExit('security scan insertion point not found')
text = text.replace(old_scan_tail, new_scan_tail, 1)

old_standalone = '''      <Panel>
        <PanelHeader icon={<Terminal className="size-4" />} title="Live feed" subtitle="Engine output while a scan runs" />
        <ScanFeed log={scanLog} scanning={scanning} />
      </Panel>
'''
if old_standalone not in text:
    raise SystemExit('standalone live feed panel not found')
text = text.replace(old_standalone, '', 1)

text = text.replace(
    'className="max-h-72 overflow-y-auto rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-2xs"',
    'className={cn("overflow-y-auto rounded-lg border bg-bg/70 px-3 py-2 font-mono text-2xs", scanning ? "max-h-80 border-amber/20" : "max-h-44 border-line")}',
    1,
)
text = text.replace(
    'Tap Run Security Analysis — live engine output appears here.',
    'Run Security Scan — live checks will appear here.',
    1,
)
text = text.replace(
    'tone={e.kind === "threat" ? "rose" : e.kind === "ok" ? "emerald" : e.kind === "learn" ? "cyan" : "muted"}',
    'tone={e.kind === "threat" ? "rose" : e.kind === "ok" ? "emerald" : e.kind === "learn" ? "amber" : "muted"}',
    1,
)
text = text.replace(
    'e.kind === "threat" ? "text-rose" : e.kind === "ok" ? "text-emerald" : e.kind === "learn" ? "text-cyan" : "text-muted"',
    'e.kind === "threat" ? "text-rose" : e.kind === "ok" ? "text-emerald" : e.kind === "learn" ? "text-amber" : "text-muted"',
    1,
)
text = text.replace(
    '{scanning ? <div className="text-cyan">▌ analyzing…</div> : null}',
    '{scanning ? <div className="text-amber">▌ working…</div> : null}',
    1,
)
text = text.replace(
    '<div className="h-full rounded-full bg-cyan" style={{ width: `${d.value}%` }} />',
    '<div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${d.value}%` }} />',
    1,
)
text = text.replace(
    'color: "text-cyan border-cyan/20 bg-cyan-dim hover:bg-cyan/20",',
    'color: "text-muted border-line bg-elevated hover:bg-white/10",',
    1,
)

OVERVIEW.write_text(text)

tests = TESTS.read_text()
marker = 'live scan stays inside the security scan flow'
if marker not in tests:
    tests += '''\n\ntest("live scan stays inside the security scan flow", () => {\n  const overview = read("src/components/security/overview-panel.tsx");\n  assert.match(overview, /Live scan/);\n  assert.match(overview, /ScanFeed log=\\{scanLog\\} scanning=\\{scanning \\|\\| deepScanning\\}/);\n  assert.doesNotMatch(overview, /title="Live feed"/);\n  assert.match(overview, /Last scan log/);\n  assert.match(overview, /e.kind === "learn" \\? "amber"/);\n});\n'''
    TESTS.write_text(tests)
