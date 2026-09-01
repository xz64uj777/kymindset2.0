from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"expected block not found in {path}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/lib/security/engine.ts",
    '''  window.addEventListener("storage", (e) => {\n    if (!e.key || !e.key.startsWith("kysmindset")) return;\n    emit({\n      type: "tamper",\n      target: "Kysmindset",\n      cause: `Security store rewritten from another tab (${e.key})`,\n      at: Date.now(),\n    });\n  });''',
    '''  const appOwnedStorageKeys = new Set([\n    "kysmindset-v4",\n    "kysmindset-v5",\n    "kysmindset-webauthn",\n    "kysmindset-hide-install-v2",\n  ]);\n  window.addEventListener("storage", (e) => {\n    if (!e.key || !e.key.startsWith("kysmindset")) return;\n    // The storage event only fires in a different same-origin document.\n    // Known Kysmindset keys are normal app synchronization, not evidence of intrusion.\n    if (appOwnedStorageKeys.has(e.key)) return;\n    emit({\n      type: "tamper",\n      target: "Kysmindset storage",\n      cause: `Unexpected Kysmindset-prefixed storage key changed in another context (${e.key})`,\n      at: Date.now(),\n    });\n  });''',
)

replace_once(
    "src/lib/security/store.ts",
    '''          set({\n            hydrated: true,\n            unlocked,\n            connection: readConnection(),\n            tamperLog: get().tamperLog ?? [],\n            lastTamper: get().lastTamper ?? null,\n          });''',
    '''          const falseStorageRewrite = (event: TamperEvent) =>\n            event.cause.startsWith("Security store rewritten from another tab (");\n          const tamperLog = (get().tamperLog ?? []).filter((event) => !falseStorageRewrite(event));\n          const previousLastTamper = get().lastTamper ?? null;\n          const lastTamper =\n            previousLastTamper && falseStorageRewrite(previousLastTamper)\n              ? tamperLog[0] ?? null\n              : previousLastTamper;\n          set({\n            hydrated: true,\n            unlocked,\n            connection: readConnection(),\n            tamperLog,\n            lastTamper,\n          });''',
)

for path in [
    "src/components/security/config-panel.tsx",
    "src/components/security/panels.tsx",
]:
    p = Path(path)
    text = p.read_text()
    text = text.replace('{e.actor === "intruder" ? "Intruder" : "You"}', '{e.actor === "intruder" ? "External" : "You"}')
    p.write_text(text)

p = Path("src/components/security/dashboard.tsx")
text = p.read_text().replace(
    'lastTamper.actor === "intruder" ? "an intrusion" : "your action"',
    'lastTamper.actor === "intruder" ? "an external change" : "your action"',
)
p.write_text(text)

tests = Path("tests/security-contract.test.mjs")
text = tests.read_text()
marker = 'test("app-owned storage synchronization is not labeled as intrusion", () => {'
if marker not in text:
    text += '''\n\ntest("app-owned storage synchronization is not labeled as intrusion", () => {\n  const engine = read("src/lib/security/engine.ts");\n  const store = read("src/lib/security/store.ts");\n  const config = read("src/components/security/config-panel.tsx");\n  assert.match(engine, /appOwnedStorageKeys/);\n  assert.match(engine, /appOwnedStorageKeys\.has\(e\.key\)/);\n  assert.doesNotMatch(engine, /cause: `Security store rewritten from another tab/);\n  assert.match(store, /falseStorageRewrite/);\n  assert.match(config, /"External"/);\n});\n'''
    tests.write_text(text)
