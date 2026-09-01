from pathlib import Path

p = Path("src/components/security/overview-panel.tsx")
text = p.read_text()

text = text.replace(
    "  const killSwitch = useSecurity((s) => s.killSwitch);\n  const score = useScore();",
    "  const killSwitch = useSecurity((s) => s.killSwitch);\n  const toggleKillSwitch = useSecurity((s) => s.toggleKillSwitch);\n  const setTab = useSecurity((s) => s.setTab);\n  const score = useScore();",
)

old_protection = '''        <p className="mt-2 text-2xs text-subtle">
          Device VPN status comes from the Android bridge. Browser/runtime telemetry below is app-only unless explicitly labeled Android or VPN.
        </p>
      </Panel>'''
new_protection = '''        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={toggleKillSwitch}>
            {killSwitch ? "Stop Protection" : "Start Protection"}
          </Button>
          <span className="text-2xs text-subtle">
            {killSwitch
              ? "App Network Guard is armed. Android VPN status above confirms the device tunnel."
              : "Starts the app network guard and requests Android VPN protection. Android may show a VPN permission prompt."}
          </span>
        </div>
        <p className="mt-2 text-2xs text-subtle">
          Device VPN status comes from the Android bridge. Browser/runtime telemetry below is app-only unless explicitly labeled Android or VPN.
        </p>
      </Panel>'''
if old_protection not in text and "Start Protection" not in text:
    raise SystemExit("Protection-state patch target not found")
if "Start Protection" not in text:
    text = text.replace(old_protection, new_protection, 1)

old_mindset = '''        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ["Observe", "Collect only what this app or Android can actually see."],
            ["Verify", "Unknown means review — never automatically malware."],
            ["Control", "Allow, block, lockdown, or cut traffic deliberately."],
            ["Recover", "Keep lock, update, and protection state easy to restore."],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-md border border-line bg-elevated p-3">
              <div className="text-xs font-semibold text-fg">{title}</div>
              <div className="mt-1 text-2xs leading-relaxed text-subtle">{detail}</div>
            </div>
          ))}
        </div>'''
new_mindset = '''        <div className="grid gap-2 sm:grid-cols-4">
          {[
            {
              title: "Observe",
              detail: "Collect only what this app or Android can actually see.",
              action: scanning ? "Analyzing…" : "Run analysis",
              disabled: scanning,
              onClick: () => void runSecurityAnalysis(),
            },
            {
              title: "Verify",
              detail: "Unknown means review — never automatically malware.",
              action: "Review network",
              disabled: false,
              onClick: () => setTab("network"),
            },
            {
              title: "Control",
              detail: "Allow, block, lockdown, or cut traffic deliberately.",
              action: killSwitch ? "Open controls" : "Start protection",
              disabled: false,
              onClick: () => (killSwitch ? setTab("network") : toggleKillSwitch()),
            },
            {
              title: "Recover",
              detail: "Keep lock, update, and protection state easy to restore.",
              action: "Open recovery",
              disabled: false,
              onClick: () => setTab("config"),
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
        </div>'''
if old_mindset not in text and "Review network" not in text:
    raise SystemExit("Mindset patch target not found")
if "Review network" not in text:
    text = text.replace(old_mindset, new_mindset, 1)

p.write_text(text)

tests = Path("tests/security-contract.test.mjs")
t = tests.read_text()
marker = 'test("overview exposes working protection and mindset actions"'
if marker not in t:
    t += '''\n\ntest("overview exposes working protection and mindset actions", () => {\n  const overview = read("src/components/security/overview-panel.tsx");\n  assert.match(overview, /Start Protection/);\n  assert.match(overview, /toggleKillSwitch/);\n  assert.match(overview, /Run analysis/);\n  assert.match(overview, /Review network/);\n  assert.match(overview, /Open recovery/);\n});\n'''
    tests.write_text(t)
