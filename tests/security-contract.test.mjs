import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Android manifest ships hardened transport and backup defaults", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /QUERY_ALL_PACKAGES/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_MEDIA_/);
  assert.equal(
    existsSync(new URL("../android/app/src/main/res/xml/network_security_config.xml", import.meta.url)),
    true,
  );
});

test("WebView does not enable universal file URL or filesystem access", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /setAllowFileAccess\(false\)/);
  assert.match(main, /setAllowContentAccess\(false\)/);
  assert.match(main, /setMixedContentMode\(WebSettings\.MIXED_CONTENT_NEVER_ALLOW\)/);
  assert.match(main, /\.invoke\(s, false\)/);
  assert.doesNotMatch(main, /\.invoke\(s, true\)/);
});

test("No default plaintext PIN or fake AI confidence remains in product code", () => {
  const store = read("src/lib/security/store.ts");
  const overview = read("src/components/security/overview-panel.tsx");
  const dialogs = read("src/components/security/dialogs.tsx");
  assert.doesNotMatch(store, /pin:\s*"1234"/);
  assert.doesNotMatch(overview, /AI Security Engine|Run AI Scan/);
  assert.doesNotMatch(dialogs, /AI Recommendation|Confidence:\s*\{/);
});

test("Persisted Zustand settings never retain a plaintext PIN", () => {
  const store = read("src/lib/security/store.ts");
  assert.match(store, /settings:\s*\{\s*\.\.\.s\.settings,\s*pin:\s*""\s*\}/s);
});

test("Native auth bridge uses a salted PBKDF2 verifier and lockout escalation", () => {
  const auth = read("android/app/src/main/java/app/kysmindset/security/SecurePin.java");
  assert.match(auth, /PBKDF2WithHmacSHA256/);
  assert.match(auth, /new SecureRandom\(\)\.nextBytes\(salt\)/);
  assert.match(auth, /fails >= 10 \? 300_000L : fails >= 7 \? 60_000L : fails >= 5 \? 15_000L/);
});

test("legacy plaintext PIN store is abandoned and unknown third parties are not scored as confirmed threats", () => {
  const store = read("src/lib/security/store.ts");
  assert.match(store, /name:\s*"kysmindset-v5"/);
  assert.match(store, /localStorage\.removeItem\("kysmindset-v4"\)/);
  assert.match(store, /filter\(\(a\) => a\.status === "suspicious"\)/);
});


test("native WebView is pinned to app assets before exposing the JavaScript bridge", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /WebViewAssetLoader/);
  assert.match(main, /appassets\.androidplatform\.net/);
  assert.match(main, /routeNavigation\(request\.getUrl\(\)\)/);
  assert.match(main, /addJavascriptInterface\(new KysBridge\(\), "KysAndroid"\)/);
  assert.doesNotMatch(main, /setWebViewClient\(new WebViewClient\(\)\)/);
});

test("Android posture bridge reports real native indicators without claiming a malware verdict", () => {
  const posture = read("android/app/src/main/java/app/kysmindset/security/DevicePosture.java");
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(posture, /Build\.VERSION\.SECURITY_PATCH/);
  assert.match(posture, /Debug\.isDebuggerConnected\(\)/);
  assert.match(posture, /isDeviceSecure\(\)/);
  assert.match(posture, /rootEvidence/);
  assert.match(main, /public String devicePosture\(\)/);
});

test("observed hosts and decoy paths are not mislabeled as malicious IP intelligence", () => {
  const store = read("src/lib/security/store.ts");
  const types = read("src/lib/security/types.ts");
  const panels = read("src/components/security/panels.tsx");
  assert.match(types, /kind: "host" \| "path"/);
  assert.doesNotMatch(store, /kind: "ip"/);
  assert.doesNotMatch(panels, /Known Threat IPs|Learned malicious IPs & DNS|AI-powered comprehensive vulnerability assessment/);
});

test("debug APK has a stable dev identity and release builds are not signed with a public debug key", () => {
  const gradle = read("android/app/build.gradle");
  assert.match(gradle, /applicationIdSuffix "\.dev"/);
  assert.match(gradle, /signingConfig signingConfigs\.sharedDebug/);
  const release = gradle.match(/release \{([\s\S]*?)\n        \}/)?.[1] ?? "";
  assert.doesNotMatch(release, /signingConfig signingConfigs\.(debug|sharedDebug)/);
  assert.equal(existsSync(new URL("../android/app/kymindset-debug.keystore", import.meta.url)), true);
});

test("self-update requires a published SHA-256 and matching package identity", () => {
  const updater = read("android/app/src/main/java/app/kysmindset/security/AppUpdate.java");
  const workflow = read(".github/workflows/android-apk.yml");
  assert.match(updater, /parseSha256/);
  assert.match(updater, /APK checksum did not match/);
  assert.match(updater, /archiveMatchesPackage/);
  assert.match(workflow, /sha256: %s/);
});

test("privileged WebView has a restrictive CSP and does not import remote executable UI code", () => {
  const html = read("index.html");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /frame-ancestors 'none'/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("JavaScript bridge events are serialized as JSON literals instead of hand-built script strings", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /JSONObject\.quote\(name == null \? "" : name\)/);
  assert.match(main, /JSONObject\.quote\(result == null \? "" : result\)/);
  assert.doesNotMatch(main, /result\.replace\("\\\\", "\\\\\\\\"\)/);
});

test("native lock-screen takeover is opt-in", () => {
  const lock = read("android/app/src/main/java/app/kysmindset/security/LockGateService.java");
  const app = read("src/App.tsx");
  const store = read("src/lib/security/store.ts");
  assert.match(lock, /getBoolean\(KEY_DEVICE_LOCK, false\)/);
  assert.match(app, /settings\.deviceLock === true/);
  assert.match(store, /deviceLock:\s*false/);
});

test("manifest follows least privilege for boot receiver and package visibility", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:name="\.BootReceiver"[\s\S]*?android:exported="false"/);
  assert.doesNotMatch(manifest, /USE_FULL_SCREEN_INTENT|DISABLE_KEYGUARD/);
  assert.doesNotMatch(manifest, /com\.facebook\.|com\.instagram\.|com\.whatsapp|com\.snapchat|com\.spotify/);
});

test("unknown activity remains review evidence rather than a confirmed threat badge", () => {
  const dashboard = read("src/components/security/dashboard.tsx");
  const store = read("src/lib/security/store.ts");
  assert.match(dashboard, /confirmedFindings = activities\.filter\(\(a\) => a\.status === "suspicious"\)/);
  assert.match(store, /confirmedFindingCount = activities\.filter/);
  assert.match(store, /a\.status === "suspicious"/);
  assert.doesNotMatch(store, /const threatN = activities\.filter\([\s\S]*?"unknown"/);
});

test("posture score cannot be inflated by emergency kill or lockdown modes", () => {
  const store = read("src/lib/security/store.ts");
  assert.doesNotMatch(store, /if \(killSwitch\) score = Math\.min/);
  assert.doesNotMatch(store, /if \(lockdown\) score = Math\.min/);
});

test("runtime control labels describe implemented behavior instead of nonexistent auto-restart", () => {
  const config = read("src/components/security/config-panel.tsx");
  assert.match(config, /title="Keep Awake"/);
  assert.match(config, /Android can still suspend or stop the app/);
  assert.doesNotMatch(config, /title="Auto Restart"/);
  assert.doesNotMatch(config, /title="Slack Alerts"/);
  assert.match(config, /App Transport/);
  assert.match(config, /not Wi-Fi encryption/);
});

test("Android posture includes developer, ADB, notification, and battery reliability signals", () => {
  const posture = read("android/app/src/main/java/app/kysmindset/security/DevicePosture.java");
  const native = read("src/lib/native.ts");
  for (const key of ["developerOptionsEnabled", "adbEnabled", "notificationsEnabled", "batteryOptimized"]) {
    assert.match(posture, new RegExp(`o\\.put\\("${key}"`));
    assert.match(native, new RegExp(`${key}: boolean`));
  }
});

test("VPN allowlist input is bounded and package-name validated", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /accepted < 200/);
  assert.match(main, /pkg\.matches\("\[A-Za-z0-9_\]\+/);
  assert.match(main, /pkg\.length\(\) > 220/);
});

test("product UI carries the evidence-first mindset", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  const store = read("src/lib/security/store.ts");
  assert.match(overview, /title="Security Scan"/);
  assert.match(overview, /title="Scan Results"/);
  assert.match(overview, /Everything that needs a decision stays here/);
  assert.match(store, /Analysis is evidence-only\. Remediation is chosen from Scan Results/);
  assert.match(overview, /Unknown hosts, Android settings, root\/debugger signals, and emergency lockdown remain manual/);
});


test("overview exposes protection and unified scan actions", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Start Protection/);
  assert.match(overview, /toggleKillSwitch/);
  assert.match(overview, /Run Security Scan/);
  assert.match(overview, /Auto Fix/);
  assert.match(overview, /Review all manually/);
});


test("app-owned storage synchronization is not labeled as intrusion", () => {
  const engine = read("src/lib/security/engine.ts");
  const store = read("src/lib/security/store.ts");
  const config = read("src/components/security/config-panel.tsx");
  assert.match(engine, /appOwnedStorageKeys/);
  assert.match(engine, /appOwnedStorageKeys\.has\(e\.key\)/);
  assert.doesNotMatch(engine, /cause: `Security store rewritten from another tab/);
  assert.match(store, /falseStorageRewrite/);
  assert.match(config, /"External"/);
});


test("scan reveals results instead of acting invisibly", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /runSecurityAnalysis\(\)\.then/);
  assert.match(overview, /runDeepScan\(\)/);
  assert.match(overview, /scrollToPanel\("Scan Results"\)/);
});

test("Android permission sheets do not trigger standalone auto-lock", () => {
  const native = read("src/lib/native.ts");
  const dashboard = read("src/components/security/dashboard.tsx");
  assert.match(native, /export function isNativePromptActive/);
  assert.match(native, /beginNativePrompt\(\)/);
  assert.match(dashboard, /!isNativePromptActive\(\)/);
});


test("native VPN permission activity does not trip device-lock pause gate", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  assert.match(main, /expectedSystemUiPending/);
  assert.match(main, /if \(shouldSuppressPauseGate\(\)\) return;/);
  assert.match(main, /beginExpectedSystemUi\(\);[\s\S]*startActivityForResult\(prep, VPN_REQ\)/);
  assert.match(main, /if \(requestCode != VPN_REQ\) return;[\s\S]*endExpectedSystemUi\(\);/);
});

test("network traffic rows expose allow block details and end controls", () => {
  const row = read("src/components/security/activity-row.tsx");
  const engine = read("src/lib/security/engine.ts");
  const store = read("src/lib/security/store.ts");
  assert.match(row, /Allow this host for future requests/);
  assert.match(row, /Block this host/);
  assert.match(row, /More options/);
  assert.match(row, /End this connection/);
  assert.match(engine, /export function unblockHost/);
  assert.match(store, /unblockHost\(a\.destination\)/);
});


test("manual review remains separate from automatic containment", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Review all manually/);
  assert.match(overview, /setTab\("network"\)/);
  const resultsStart = overview.indexOf('title="Scan Results"');
  const resultsEnd = overview.indexOf('title="Live feed"', resultsStart);
  assert.ok(resultsStart >= 0 && resultsEnd > resultsStart);
  const results = overview.slice(resultsStart, resultsEnd);
  assert.doesNotMatch(results, /toggleLockdown/);
  assert.doesNotMatch(results, /toggleKillSwitch/);
});

test("emergency lockdown remains an explicitly manual control", () => {
  const dashboard = read("src/components/security/dashboard.tsx");
  assert.match(dashboard, /Emergency Lockdown — manual/);
  assert.match(dashboard, /Manual emergency lockdown armed/);
});


test("security scan is evidence-only until the user chooses remediation", () => {
  const store = read("src/lib/security/store.ts");
  const start = store.indexOf("runSecurityAnalysis: async");
  const end = store.indexOf("runDeepScan:", start);
  assert.ok(start >= 0 && end > start);
  const scan = store.slice(start, end);
  assert.doesNotMatch(scan, /settings\.autoLockdown/);
  assert.doesNotMatch(scan, /Blocked by scan/);
});

test("post-scan results keep auto-fix and manual decisions together", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /title="Scan Results"/);
  assert.match(overview, /Auto Fix/);
  assert.match(overview, /Review all manually/);
  assert.match(overview, /<ActivityRow key=/);
  assert.match(overview, /Unknown hosts, Android settings, root\/debugger signals, and emergency lockdown remain manual/);
});

test("auto-fix only targets confirmed traffic and reversible app controls", () => {
  const store = read("src/lib/security/store.ts");
  const start = store.lastIndexOf("      autoFixScan: () => {");
  const end = store.indexOf("      clearResolved:", start);
  assert.ok(start >= 0 && end > start);
  const fix = store.slice(start, end);
  assert.match(fix, /a\.type === "traffic" && a\.status === "suspicious"/);
  assert.match(fix, /tamperProtection: true/);
  assert.match(fix, /armed: true/);
  assert.doesNotMatch(fix, /toggleLockdown/);
  assert.doesNotMatch(fix, /toggleKillSwitch/);
});


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


test("actions use explicit review destinations", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /Review connections \(\{connectionReview\.length\}\)/);
  assert.match(overview, /Review alerts \(\{threats\.length\}\)/);
  assert.match(overview, /setTab\("network"\)/);
  assert.match(overview, /=== "Scan Results"/);
  assert.doesNotMatch(overview, /tap to review hosts/i);
});


test("self-update surfaces Android installer confirmation", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  const update = read("android/app/src/main/java/app/kysmindset/security/AppUpdate.java");
  assert.match(main, /PackageInstaller\.EXTRA_STATUS/);
  assert.match(main, /PackageInstaller\.STATUS_PENDING_USER_ACTION/);
  assert.match(main, /Intent\.EXTRA_INTENT/);
  assert.match(main, /startActivity\(confirm\)/);
  assert.match(main, /handleUpdateIntent\(getIntent\(\)\)/);
  assert.match(main, /handleUpdateIntent\(intent\)/);
  assert.match(update, /USER_ACTION_REQUIRED/);
  assert.doesNotMatch(update, /USER_ACTION_NOT_REQUIRED/);
});


test("native VPN desired state survives service lifecycle", () => {
  const vpn = read("android/app/src/main/java/app/kysmindset/security/KillVpnService.java");
  const boot = read("android/app/src/main/java/app/kysmindset/security/BootReceiver.java");
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  const posture = read("android/app/src/main/java/app/kysmindset/security/DevicePosture.java");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(vpn, /KEY_DESIRED = "vpn_desired"/);
  assert.match(vpn, /restoreIfDesired/);
  assert.match(vpn, /setDesired\(this, true\)/);
  assert.match(vpn, /ACTION_STOP[\s\S]*setDesired\(this, false\)/);
  assert.match(vpn, /onRevoke\(\)[\s\S]*setDesired\(this, false\)/);
  assert.match(boot, /KillVpnService\.restoreIfDesired\(context\)/);
  assert.match(main, /KillVpnService\.restoreIfDesired\(this\)/);
  assert.match(main, /KillVpnService\.active \? "on" : "denied"/);
  assert.match(posture, /"vpnDesired"/);
  assert.match(manifest, /MY_PACKAGE_REPLACED/);
});

test("scan separates alerts review and weakened protection", () => {
  const store = read("src/lib/security/store.ts");
  const overview = read("src/components/security/overview-panel.tsx");
  assert.doesNotMatch(store, /third-party host\$\{snap\.thirdPartyHosts\.length === 1/);
  assert.match(store, /Review \$\{snap\.thirdPartyHosts\.length\} third-party connection/);
  assert.match(store, /Android secure screen lock is off/);
  assert.match(store, /Review unknown hosts/);
  assert.match(overview, /\? "Review needed"/);
  assert.match(overview, />Review<\/div>/);
  assert.match(overview, />Weakened<\/div>/);
  assert.match(overview, /Interrupted — recovery pending/);
  assert.doesNotMatch(overview, /Needs review \/ weakened/);
});
