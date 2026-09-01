from pathlib import Path

p = Path("tests/security-contract.test.mjs")
t = p.read_text()
old = '  assert.match(overview, /scrollToPanel\\("Protection state"\\)/);\n'
new = '  assert.match(overview, /setTab\\("network"\\)/);\n'
if old in t:
    p.write_text(t.replace(old, new, 1))
elif new not in t:
    raise SystemExit("control visibility contract pattern not found")
