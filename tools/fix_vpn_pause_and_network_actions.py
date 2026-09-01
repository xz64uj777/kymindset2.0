from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# Native Android: Kymindset-owned system activities (notably VPN permission)
# pause MainActivity. Skip exactly that expected pause so Device Lock doesn't
# mistake the permission sheet for the user leaving the app.
replace_once(
    "android/app/src/main/java/app/kysmindset/security/MainActivity.java",
    "    private WebView web;\n    private boolean gated = true;\n",
    "    private WebView web;\n    private boolean gated = true;\n    private boolean suppressNextPauseGate = false;\n",
)
replace_once(
    "android/app/src/main/java/app/kysmindset/security/MainActivity.java",
    "    protected void onPause() {\n        super.onPause();\n        if (LockGateService.deviceLockOn(this) && !gated) {\n            gated = true;\n            sendEvent(\"kys-gate\", \"lock\");\n        }\n    }\n",
    "    protected void onPause() {\n        super.onPause();\n        if (suppressNextPauseGate) {\n            suppressNextPauseGate = false;\n            return;\n        }\n        if (LockGateService.deviceLockOn(this) && !gated) {\n            gated = true;\n            sendEvent(\"kys-gate\", \"lock\");\n        }\n    }\n",
)
replace_once(
    "android/app/src/main/java/app/kysmindset/security/MainActivity.java",
    "                    if (prep != null) {\n                        startActivityForResult(prep, VPN_REQ);\n                    } else {\n",
    "                    if (prep != null) {\n                        suppressNextPauseGate = true;\n                        startActivityForResult(prep, VPN_REQ);\n                    } else {\n",
)
replace_once(
    "android/app/src/main/java/app/kysmindset/security/MainActivity.java",
    "        public void requestAdmin() {\n            runOnUiThread(\n                () -> startActivityForResult(DeviceOwner.adminAddIntent(MainActivity.this), ADMIN_REQ));\n        }\n",
    "        public void requestAdmin() {\n            runOnUiThread(\n                () -> {\n                    suppressNextPauseGate = true;\n                    startActivityForResult(DeviceOwner.adminAddIntent(MainActivity.this), ADMIN_REQ);\n                });\n        }\n",
)

# Guard engine: Allow must be able to undo a prior host block.
replace_once(
    "src/lib/security/engine.ts",
    "export function blockHost(host: string) {\n  if (!host) return;\n  blockedHosts.add(host);\n  applyGuard({ ...guard, blocked: [...blockedHosts] });\n}\n\nexport function blockedHostList() {\n",
    "export function blockHost(host: string) {\n  if (!host) return;\n  blockedHosts.add(host);\n  applyGuard({ ...guard, blocked: [...blockedHosts] });\n}\n\nexport function unblockHost(host: string) {\n  if (!host) return;\n  blockedHosts.delete(host);\n  applyGuard({ ...guard, blocked: [...blockedHosts] });\n}\n\nexport function blockedHostList() {\n",
)
replace_once(
    "src/lib/security/store.ts",
    "  unregisterGuardWorker,\n} from \"./engine\";\n",
    "  unregisterGuardWorker,\n  unblockHost,\n} from \"./engine\";\n",
)
replace_once(
    "src/lib/security/store.ts",
    "      allow: (id) => {\n        const a = get().activities.find((x) => x.id === id);\n        if (!a) return;\n        set({\n          activities: get().activities.map((x) =>\n            x.id === id ? { ...x, status: \"allowed\" as const, resolveNote: \"Allowed by user\" } : x,\n          ),\n          history: pushHistory(get().history, \"Allowed\", a.name, a.details),\n        });\n      },\n",
    "      allow: (id) => {\n        const a = get().activities.find((x) => x.id === id);\n        if (!a) return;\n        if (a.type === \"traffic\" && a.destination) unblockHost(a.destination);\n        set({\n          activities: get().activities.map((x) =>\n            x.id === id ? { ...x, status: \"allowed\" as const, resolveNote: \"Allowed by user\" } : x,\n          ),\n          history: pushHistory(get().history, \"Allowed\", a.name, a.details),\n        });\n        syncGuardFrom(get);\n      },\n",
)

# Network rows: don't leave known/allowed traffic with only an End button.
replace_once(
    "src/components/security/activity-row.tsx",
    "          {item.type === \"process\" && item.status === \"paused\" ? (\n",
    "          {item.type === \"traffic\" && !needsDecision ? (\n            <>\n              {dead ? (\n                <Chip\n                  title=\"Allow this host for future requests\"\n                  onClick={() => {\n                    allow(item.id);\n                    toast.success(`Allowed ${item.name} for future requests`);\n                  }}\n                  className=\"text-emerald border-emerald/25 bg-emerald-dim\"\n                >\n                  <Check className=\"size-3\" />\n                  Allow\n                </Chip>\n              ) : (\n                <Chip\n                  title=\"Block this host\"\n                  onClick={() => {\n                    block(item.id);\n                    toast.success(`Blocked ${item.name}`);\n                  }}\n                  className=\"text-red border-red/25 bg-red-dim\"\n                >\n                  <Ban className=\"size-3\" />\n                  Block\n                </Chip>\n              )}\n              <Chip title=\"More options\" onClick={() => setPending(item)} className=\"text-cyan border-cyan/25 bg-cyan-dim\">\n                <Info className=\"size-3\" />\n                Details\n              </Chip>\n            </>\n          ) : null}\n          {item.type === \"process\" && item.status === \"paused\" ? (\n",
)

# Contract coverage for the exact phone-test regressions.
tests = Path("tests/security-contract.test.mjs")
t = tests.read_text()
marker = 'test("Android permission sheets do not trigger standalone auto-lock", () => {'
if marker not in t:
    raise SystemExit("test marker missing")
append = '''\n\ntest("native VPN permission activity does not trip device-lock pause gate", () => {\n  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");\n  assert.match(main, /suppressNextPauseGate/);\n  assert.match(main, /if \(suppressNextPauseGate\)/);\n  assert.match(main, /suppressNextPauseGate = true;[\\s\\S]*startActivityForResult\(prep, VPN_REQ\)/);\n});\n\ntest("network traffic rows expose allow block details and end controls", () => {\n  const row = read("src/components/security/activity-row.tsx");\n  const engine = read("src/lib/security/engine.ts");\n  const store = read("src/lib/security/store.ts");\n  assert.match(row, /Allow this host for future requests/);\n  assert.match(row, /Block this host/);\n  assert.match(row, /More options/);\n  assert.match(row, /End this connection/);\n  assert.match(engine, /export function unblockHost/);\n  assert.match(store, /unblockHost\(a\.destination\)/);\n});\n'''
if 'native VPN permission activity does not trip device-lock pause gate' not in t:
    tests.write_text(t + append)
