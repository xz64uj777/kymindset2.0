from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))

# Mindset Control is navigation/decision-making, never an automatic containment action.
replace_once(
    "src/components/security/overview-panel.tsx",
    '''            {
              title: "Control",
              detail: "Allow, block, lockdown, or cut traffic deliberately.",
              action: killSwitch ? "Open controls" : "Start protection",
              disabled: false,
              onClick: () => {
                if (!killSwitch) {
                  toggleKillSwitch();
                  toast.message("Starting protection — approve Android VPN if prompted.");
                } else {
                  scrollToPanel("Protection state");
                  toast.message("Protection is active. Use Stop Protection or Network for detailed controls.");
                }
              },
            },''',
    '''            {
              title: "Control",
              detail: "Choose allow, block, protection, or emergency containment deliberately.",
              action: "Open controls",
              disabled: false,
              onClick: () => {
                setTab("network");
                toast.message("Controls opened — review the evidence, then choose Allow, Block, End, or emergency protection.");
              },
            },''',
)

# Make the emergency nature and manual behavior explicit in the persistent header.
replace_once(
    "src/components/security/dashboard.tsx",
    'title="Emergency Lockdown"',
    'title="Emergency Lockdown — manual"',
)
replace_once(
    "src/components/security/dashboard.tsx",
    'if (arming) toast.error("App lockdown armed — unclassified third-party Kysmindset requests are blocked.");',
    'if (arming) toast.error("Manual emergency lockdown armed — unclassified third-party Kysmindset requests are blocked.");',
)

# Regression coverage: the Mindset Control tile must never arm protection/lockdown itself.
tests = Path("tests/security-contract.test.mjs")
t = tests.read_text()
append = '''\n\ntest("mindset Control opens controls without arming containment", () => {\n  const overview = read("src/components/security/overview-panel.tsx");\n  const start = overview.indexOf('title: "Control"');\n  const end = overview.indexOf('title: "Recover"', start);\n  assert.ok(start >= 0 && end > start);\n  const control = overview.slice(start, end);\n  assert.match(control, /action: "Open controls"/);\n  assert.match(control, /setTab\("network"\)/);\n  assert.doesNotMatch(control, /toggleKillSwitch/);\n  assert.doesNotMatch(control, /toggleLockdown/);\n  assert.doesNotMatch(control, /Start protection/);\n});\n\ntest("emergency lockdown remains an explicitly manual control", () => {\n  const dashboard = read("src/components/security/dashboard.tsx");\n  assert.match(dashboard, /Emergency Lockdown — manual/);\n  assert.match(dashboard, /Manual emergency lockdown armed/);\n});\n'''
if 'mindset Control opens controls without arming containment' not in t:
    tests.write_text(t + append)
