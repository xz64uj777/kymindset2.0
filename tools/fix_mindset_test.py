from pathlib import Path
p = Path("tests/security-contract.test.mjs")
text = p.read_text()
old = 'assert.match(overview, /Open recovery/);'
new = 'assert.match(overview, /Recovery actions/);'
if old not in text:
    raise SystemExit("stale recovery contract assertion not found")
p.write_text(text.replace(old, new, 1))
