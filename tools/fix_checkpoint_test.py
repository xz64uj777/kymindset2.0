from pathlib import Path
import re

# Tighten the scan-semantics regression without banning truthful evidence reporting.
test_path = Path("tests/security-contract.test.mjs")
tests = test_path.read_text()
old = '  assert.doesNotMatch(store, /third-party host\\$\\{snap\\.thirdPartyHosts\\.length === 1/);\n'
new = '''  const deepStart = store.indexOf("runDeepScan: () => {");
  const deepEnd = store.indexOf("patchSettings:", deepStart);
  assert.ok(deepStart >= 0 && deepEnd > deepStart);
  const deep = store.slice(deepStart, deepEnd);
  assert.doesNotMatch(deep, /vulns\\.push\\(\\{[\\s\\S]*third-party host/i);
'''
if old in tests:
    tests = tests.replace(old, new, 1)
elif 'const deepStart = store.indexOf("runDeepScan: () => {");' not in tests:
    raise SystemExit("checkpoint scan assertion not found")
test_path.write_text(tests)

# The migration helper can be invoked more than once while CI is being stabilized.
# Collapse repeated type/posture insertions so the source stays valid and deterministic.
native_path = Path("src/lib/native.ts")
native = native_path.read_text()
native = re.sub(r'(  vpnDesired: boolean;\n)+', '  vpnDesired: boolean;\n', native)
native_path.write_text(native)

posture_path = Path("android/app/src/main/java/app/kysmindset/security/DevicePosture.java")
posture = posture_path.read_text()
posture = re.sub(
    r'(            o\.put\("vpnDesired", KillVpnService\.desired\(ctx\)\);\n)+',
    '            o.put("vpnDesired", KillVpnService.desired(ctx));\n',
    posture,
)
posture_path.write_text(posture)
