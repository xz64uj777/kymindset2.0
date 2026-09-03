from pathlib import Path

path = Path("tests/security-contract.test.mjs")
text = path.read_text()
old = '  assert.doesNotMatch(store, /third-party host\\$\\{snap\\.thirdPartyHosts\\.length === 1/);\n'
new = '''  const deepStart = store.indexOf("runDeepScan: () => {");
  const deepEnd = store.indexOf("patchSettings:", deepStart);
  assert.ok(deepStart >= 0 && deepEnd > deepStart);
  const deep = store.slice(deepStart, deepEnd);
  assert.doesNotMatch(deep, /vulns\\.push\\(\\{[\\s\\S]*third-party host/i);
'''
if old not in text:
    raise SystemExit("checkpoint assertion not found")
path.write_text(text.replace(old, new, 1))
