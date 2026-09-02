from pathlib import Path

STORE = Path("src/lib/security/store.ts")
TESTS = Path("tests/security-contract.test.mjs")

store = STORE.read_text()
old_tab = '          tab: next ? "network" : get().tab,\n'
new_tab = '          tab: get().tab,\n'
if old_tab in store:
    store = store.replace(old_tab, new_tab, 1)
elif new_tab not in store:
    raise SystemExit("protection tab state pattern not found")

old_denied = '''          if (status === "denied") {
            set({
              killSwitch: false,
              history: pushHistory(
                get().history,
                "VPN permission denied",
                "Network",
                "Android VPN permission was denied. Kysmindset's own network guard remains the only enforced layer.",
              ),
            });
            syncGuardFrom(get);
'''
new_denied = '''          if (status === "denied") {
            set({
              history: pushHistory(
                get().history,
                "Device VPN unavailable",
                "Network",
                "Android VPN permission was denied or unavailable. Kysmindset's app network guard remains active until you stop protection.",
              ),
            });
            // Keep killSwitch true: it represents the app request guard too. The UI reports Android VPN separately.
            syncGuardFrom(get);
'''
if old_denied in store:
    store = store.replace(old_denied, new_denied, 1)
elif new_denied not in store:
    raise SystemExit("VPN denied state pattern not found")
STORE.write_text(store)

tests = TESTS.read_text()
marker = 'test("protection remains internally consistent when Android VPN is unavailable"'
if marker not in tests:
    tests += r'''

test("protection remains internally consistent when Android VPN is unavailable", () => {
  const store = read("src/lib/security/store.ts");
  const start = store.indexOf("toggleKillSwitch: () => {");
  const end = store.indexOf("toggleLockdown:", start);
  assert.ok(start >= 0 && end > start);
  const toggle = store.slice(start, end);
  assert.doesNotMatch(toggle, /tab: next \? "network"/);
  const denied = toggle.indexOf('status === "denied"');
  assert.ok(denied >= 0);
  const deniedBlock = toggle.slice(denied, toggle.indexOf('status === "on"', denied));
  assert.doesNotMatch(deniedBlock, /killSwitch:\s*false/);
  assert.match(deniedBlock, /app network guard remains active/);
});
'''
else:
    tests = tests.replace(
        'const start = store.indexOf("toggleKillSwitch: () =>");',
        'const start = store.indexOf("toggleKillSwitch: () => {");',
        1,
    )
TESTS.write_text(tests)
