from pathlib import Path

OVERVIEW = Path("src/components/security/overview-panel.tsx")
TESTS = Path("tests/security-contract.test.mjs")

overview = OVERVIEW.read_text()

overview = overview.replace(
'''  const pending = activities.filter((a) => a.status === "suspicious" || a.status === "unknown");
  const threats = activities.filter((a) => a.status === "suspicious");
''',
'''  const pending = activities.filter((a) => a.status === "suspicious" || a.status === "unknown");
  const threats = activities.filter((a) => a.status === "suspicious");
  const connectionReview = pending.filter((a) => a.type === "traffic");
''',
1,
)

old = '''      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => setTab("network")}
          className="mb-3 w-full rounded-md border border-rose/25 bg-rose-dim/40 px-3 py-2 text-left text-xs text-rose"
        >
          Open items are on Network — tap to review hosts
        </button>
      ) : null}
'''
new = '''      {connectionReview.length > 0 || threats.length > 0 ? (
        <div className="mb-3 rounded-md border border-amber/20 bg-amber-dim/20 p-3">
          <div className="mb-2 text-xs font-semibold text-fg">Review needed</div>
          <div className="flex flex-wrap gap-2">
            {connectionReview.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setTab("network")}>
                Review connections ({connectionReview.length})
              </Button>
            ) : null}
            {threats.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTab("overview");
                  window.setTimeout(() => {
                    const sections = Array.from(document.querySelectorAll("section"));
                    const target = sections.find(
                      (section) => section.querySelector("h3")?.textContent?.trim() === "Scan Results",
                    );
                    target?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 0);
                }}
              >
                Review alerts ({threats.length})
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
'''
if old not in overview:
    raise SystemExit("old review action block not found")
overview = overview.replace(old, new, 1)
OVERVIEW.write_text(overview)

tests = TESTS.read_text()
marker = 'test("actions use explicit review destinations"'
if marker not in tests:
    tests += r'''

test("actions use explicit review destinations", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Review connections \(\{connectionReview\.length\}\)/);
  assert.match(overview, /Review alerts \(\{threats\.length\}\)/);
  assert.match(overview, /setTab\("network"\)/);
  assert.match(overview, /=== "Scan Results"/);
  assert.doesNotMatch(overview, /tap to review hosts/i);
});
'''
TESTS.write_text(tests)
