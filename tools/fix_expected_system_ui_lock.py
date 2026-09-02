from pathlib import Path

MAIN = Path("android/app/src/main/java/app/kysmindset/security/MainActivity.java")
NATIVE = Path("src/lib/native.ts")
TESTS = Path("tests/security-contract.test.mjs")

main = MAIN.read_text()

if "import android.os.SystemClock;" not in main:
    main = main.replace(
        "import android.os.Bundle;\n",
        "import android.os.Bundle;\nimport android.os.SystemClock;\n",
        1,
    )
main = main.replace(
    "    private boolean suppressNextPauseGate = false;\n",
    "    private boolean expectedSystemUiPending = false;\n    private long pauseGateGraceUntilMs = 0L;\n",
    1,
)

old_pause = '''    @Override
    protected void onPause() {
        super.onPause();
        if (suppressNextPauseGate) {
            suppressNextPauseGate = false;
            return;
        }
        if (LockGateService.deviceLockOn(this) && !gated) {
            gated = true;
            sendEvent("kys-gate", "lock");
        }
    }
'''
new_pause = '''    private void beginExpectedSystemUi() {
        expectedSystemUiPending = true;
    }

    private void endExpectedSystemUi() {
        expectedSystemUiPending = false;
        pauseGateGraceUntilMs = SystemClock.elapsedRealtime() + 5000L;
    }

    private boolean shouldSuppressPauseGate() {
        return expectedSystemUiPending || SystemClock.elapsedRealtime() < pauseGateGraceUntilMs;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (shouldSuppressPauseGate()) return;
        if (LockGateService.deviceLockOn(this) && !gated) {
            gated = true;
            sendEvent("kys-gate", "lock");
        }
    }
'''
if old_pause in main:
    main = main.replace(old_pause, new_pause, 1)
elif new_pause not in main:
    raise SystemExit("onPause gate pattern not found")

old_result = '''        if (requestCode == ADMIN_REQ) {
            if (DeviceOwner.isAdmin(this)) {
                DeviceOwner.applyLockPolicies(this);
                startLockGate();
            }
            return;
        }
        if (requestCode != VPN_REQ) return;
        if (resultCode == RESULT_OK) startVpn();
        else sendKill("denied");
'''
new_result = '''        if (requestCode == ADMIN_REQ) {
            endExpectedSystemUi();
            if (DeviceOwner.isAdmin(this)) {
                DeviceOwner.applyLockPolicies(this);
                startLockGate();
            }
            return;
        }
        if (requestCode != VPN_REQ) return;
        endExpectedSystemUi();
        if (resultCode == RESULT_OK) startVpn();
        else sendKill("denied");
'''
if old_result in main:
    main = main.replace(old_result, new_result, 1)
elif new_result not in main:
    raise SystemExit("activity result pattern not found")

old_vpn = '''                    Intent prep = VpnService.prepare(MainActivity.this);
                    if (prep != null) {
                        suppressNextPauseGate = true;
                        startActivityForResult(prep, VPN_REQ);
                    } else {
                        startVpn();
                    }
'''
new_vpn = '''                    Intent prep = VpnService.prepare(MainActivity.this);
                    if (prep != null) {
                        beginExpectedSystemUi();
                        startActivityForResult(prep, VPN_REQ);
                    } else {
                        startVpn();
                    }
'''
if old_vpn in main:
    main = main.replace(old_vpn, new_vpn, 1)
elif new_vpn not in main:
    raise SystemExit("VPN permission launch pattern not found")

old_admin = '''                () -> {
                    suppressNextPauseGate = true;
                    startActivityForResult(DeviceOwner.adminAddIntent(MainActivity.this), ADMIN_REQ);
                });
'''
new_admin = '''                () -> {
                    beginExpectedSystemUi();
                    startActivityForResult(DeviceOwner.adminAddIntent(MainActivity.this), ADMIN_REQ);
                });
'''
if old_admin in main:
    main = main.replace(old_admin, new_admin, 1)
elif new_admin not in main:
    raise SystemExit("admin permission launch pattern not found")

old_bio_start = '''                    prompt.authenticate(info);
'''
new_bio_start = '''                    beginExpectedSystemUi();
                    prompt.authenticate(info);
'''
if new_bio_start not in main:
    if old_bio_start not in main:
        raise SystemExit("biometric start pattern not found")
    main = main.replace(old_bio_start, new_bio_start, 1)

old_bio_success = '''                                    sendBio("ok");
'''
new_bio_success = '''                                    endExpectedSystemUi();
                                    sendBio("ok");
'''
if new_bio_success not in main:
    if old_bio_success not in main:
        raise SystemExit("biometric success pattern not found")
    main = main.replace(old_bio_success, new_bio_success, 1)

old_bio_error = '''                                public void onAuthenticationError(
                                    int errorCode, @NonNull CharSequence errString) {
                                    if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS
'''
new_bio_error = '''                                public void onAuthenticationError(
                                    int errorCode, @NonNull CharSequence errString) {
                                    endExpectedSystemUi();
                                    if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS
'''
if new_bio_error not in main:
    if old_bio_error not in main:
        raise SystemExit("biometric error pattern not found")
    main = main.replace(old_bio_error, new_bio_error, 1)

MAIN.write_text(main)

native = NATIVE.read_text()
if "  }, 5000);" not in native:
    native = native.replace("  }, 1500);", "  }, 5000);", 1)
NATIVE.write_text(native)

tests = TESTS.read_text()
old_test = r'''test("native VPN permission activity does not trip device-lock pause gate", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /suppressNextPauseGate/);
  assert.match(main, /if \(suppressNextPauseGate\)/);
  assert.match(main, /suppressNextPauseGate = true;[\s\S]*startActivityForResult\(prep, VPN_REQ\)/);
});'''
new_test = r'''test("native VPN permission activity does not trip device-lock pause gate", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /expectedSystemUiPending/);
  assert.match(main, /if \(shouldSuppressPauseGate\(\)\) return;/);
  assert.match(main, /beginExpectedSystemUi\(\);[\s\S]*startActivityForResult\(prep, VPN_REQ\)/);
  assert.match(main, /if \(requestCode != VPN_REQ\) return;[\s\S]*endExpectedSystemUi\(\);/);
});'''
if old_test in tests:
    tests = tests.replace(old_test, new_test, 1)

marker = 'test("app-initiated Android system UI cannot trip the lock gate"'
if marker not in tests:
    tests += r'''

test("app-initiated Android system UI cannot trip the lock gate", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  const native = read("src/lib/native.ts");
  assert.match(main, /expectedSystemUiPending/);
  assert.match(main, /shouldSuppressPauseGate\(\)/);
  assert.match(main, /if \(shouldSuppressPauseGate\(\)\) return;/);
  assert.match(main, /beginExpectedSystemUi\(\);[\s\S]*startActivityForResult\(prep, VPN_REQ\)/);
  assert.match(main, /if \(requestCode != VPN_REQ\) return;[\s\S]*endExpectedSystemUi\(\);/);
  assert.doesNotMatch(main, /suppressNextPauseGate/);
  assert.match(native, /}, 5000\);/);
});
'''
TESTS.write_text(tests)
