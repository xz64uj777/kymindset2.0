from pathlib import Path

p = Path("tests/security-contract.test.mjs")
t = p.read_text()

replacements = [
(
'''test("product UI carries the evidence-first mindset", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /title="Mindset"/);
  assert.match(overview, /Observe → verify → control → recover/i);
  assert.match(overview, /Unknown means review — never automatically malware/);
});''',
'''test("product UI carries the evidence-first mindset", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  const store = read("src/lib/security/store.ts");
  assert.match(overview, /title="Security Scan"/);
  assert.match(overview, /title="Scan Results"/);
  assert.match(overview, /Everything that needs a decision stays here/);
  assert.match(store, /Analysis is evidence-only\. Remediation is chosen from Scan Results/);
  assert.match(overview, /Unknown hosts, Android settings, root\/debugger signals, and emergency lockdown remain manual/);
});'''
),
(
'''test("overview exposes working protection and mindset actions", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Start Protection/);
  assert.match(overview, /toggleKillSwitch/);
  assert.match(overview, /Run analysis/);
  assert.match(overview, /Review network/);
  assert.match(overview, /Recovery actions/);
});''',
'''test("overview exposes protection and unified scan actions", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Start Protection/);
  assert.match(overview, /toggleKillSwitch/);
  assert.match(overview, /Run Security Scan/);
  assert.match(overview, /Auto Fix/);
  assert.match(overview, /Review all manually/);
});'''
),
(
'''test("mindset actions reveal their result instead of acting invisibly", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /scrollToPanel\("Security Analysis Engine"\)/);
  assert.match(overview, /setTab\("network"\)/);
  assert.match(overview, /scrollToPanel\("Actions"\)/);
});''',
'''test("scan reveals results instead of acting invisibly", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /runSecurityAnalysis\(\)\.then/);
  assert.match(overview, /runDeepScan\(\)/);
  assert.match(overview, /scrollToPanel\("Scan Results"\)/);
});'''
),
(
'''test("mindset Control opens controls without arming containment", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  const start = overview.indexOf('title: "Control"');
  const end = overview.indexOf('title: "Recover"', start);
  assert.ok(start >= 0 && end > start);
  const control = overview.slice(start, end);
  assert.match(control, /action: "Open controls"/);
  assert.match(control, /setTab\("network"\)/);
  assert.doesNotMatch(control, /toggleKillSwitch/);
  assert.doesNotMatch(control, /toggleLockdown/);
  assert.doesNotMatch(control, /Start protection/);
});''',
'''test("manual review remains separate from automatic containment", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Review all manually/);
  assert.match(overview, /setTab\("network"\)/);
  const resultsStart = overview.indexOf('title="Scan Results"');
  const resultsEnd = overview.indexOf('title="Live feed"', resultsStart);
  assert.ok(resultsStart >= 0 && resultsEnd > resultsStart);
  const results = overview.slice(resultsStart, resultsEnd);
  assert.doesNotMatch(results, /toggleLockdown/);
  assert.doesNotMatch(results, /toggleKillSwitch/);
});'''
),
]

for old, new in replacements:
    if old in t:
        t = t.replace(old, new, 1)
    elif new not in t:
        raise SystemExit(f"expected stale contract block not found: {old.splitlines()[0]}")

old = '''test("auto-fix only targets confirmed traffic and reversible app controls", () => {
  const store = read("src/lib/security/store.ts");
  const start = store.indexOf("autoFixScan: () =>");
  const end = store.indexOf("clearResolved:", start);
  assert.ok(start >= 0 && end > start);
  const fix = store.slice(start, end);
  assert.match(fix, /a\.type === "traffic" && a\.status === "suspicious"/);
  assert.match(fix, /tamperProtection: true/);
  assert.match(fix, /armed: true/);
  assert.doesNotMatch(fix, /toggleLockdown/);
  assert.doesNotMatch(fix, /toggleKillSwitch/);
});'''
new = '''test("auto-fix only targets confirmed traffic and reversible app controls", () => {
  const store = read("src/lib/security/store.ts");
  const start = store.lastIndexOf("      autoFixScan: () => {");
  const end = store.indexOf("      clearResolved:", start);
  assert.ok(start >= 0 && end > start);
  const fix = store.slice(start, end);
  assert.match(fix, /a\.type === "traffic" && a\.status === "suspicious"/);
  assert.match(fix, /tamperProtection: true/);
  assert.match(fix, /armed: true/);
  assert.doesNotMatch(fix, /toggleLockdown/);
  assert.doesNotMatch(fix, /toggleKillSwitch/);
});'''
if old in t:
    t = t.replace(old, new, 1)
elif new not in t:
    raise SystemExit("auto-fix implementation contract not found")

p.write_text(t)
