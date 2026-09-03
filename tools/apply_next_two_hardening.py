from pathlib import Path

MANIFEST = Path('android/app/src/main/AndroidManifest.xml')
STORE = Path('src/lib/security/store.ts')
OVERVIEW = Path('src/components/security/overview-panel.tsx')
TESTS = Path('tests/security-contract.test.mjs')

manifest = MANIFEST.read_text()
store = STORE.read_text()
overview = OVERVIEW.read_text()
tests = TESTS.read_text()

# 1) Protection persistence/recovery: package replacement should use the same restore path as boot.
needle = '                <action android:name="android.intent.action.BOOT_COMPLETED" />\n'
if 'android.intent.action.MY_PACKAGE_REPLACED' not in manifest:
    manifest = manifest.replace(
        needle,
        needle + '                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />\n',
        1,
    )

# Reconcile the web guard with Android's persisted desired VPN state when the UI hydrates.
old = '''          set({
            hydrated: true,
            unlocked,
            connection: readConnection(),
            tamperLog,
            lastTamper,
          });
          void bootEngine().then(async () => {
            syncGuardFrom(get);'''
new = '''          const native = readDevicePosture();
          const restoredKillSwitch = get().killSwitch || Boolean(native?.vpnDesired);
          set({
            hydrated: true,
            unlocked,
            connection: readConnection(),
            tamperLog,
            lastTamper,
            killSwitch: restoredKillSwitch,
            devicePosture: native,
          });
          void bootEngine().then(async () => {
            syncGuardFrom(get);'''
if old in store:
    store = store.replace(old, new, 1)

# Keep native posture fresh in the main store as live telemetry changes.
old = '        const st = get();\n        const pausedMonitor = st.activities.some('
new = '        const st = get();\n        const nativePosture = readDevicePosture();\n        if (nativePosture) set({ devicePosture: nativePosture });\n        const pausedMonitor = st.activities.some('
if old in store and 'const nativePosture = readDevicePosture();' not in store:
    store = store.replace(old, new, 1)

# 2) Scan semantics: keep confirmed alerts and unknown review items visibly separate.
old = '''          {openItems.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-fg">Alerts & review items</div>
              {openItems.slice(0, 4).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
              {openItems.length > 4 ? (
                <button type="button" onClick={() => setTab("network")} className="text-xs font-medium text-cyan hover:underline">
                  Review all {openItems.length} manually →
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-emerald/20 bg-emerald-dim/30 px-3 py-2 text-xs text-emerald">
              No open network findings need a decision.
            </p>
          )}'''
new = '''          {threats.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-rose">Alerts · confirmed suspicious</div>
              {threats.slice(0, 3).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          ) : null}

          {reviewItems.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-amber">Needs review · unknown / unclassified</div>
              {reviewItems.slice(0, 3).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          ) : null}

          {openItems.length > 6 ? (
            <button type="button" onClick={() => setTab("network")} className="mt-3 text-xs font-medium text-fg hover:underline">
              Open Network to review all {openItems.length} items →
            </button>
          ) : null}

          {!openItems.length ? (
            <p className="mt-4 rounded-md border border-emerald/20 bg-emerald-dim/30 px-3 py-2 text-xs text-emerald">
              No open network findings need a decision.
            </p>
          ) : null}'''
if old in overview:
    overview = overview.replace(old, new, 1)

# Make recommendation language preserve the same distinction.
store = store.replace(
    '          if (openFindings.length)\n            recs.push({ action: "Review, block, or allow remaining open hosts", priority: "high" });',
    '''          const confirmedOpen = openFindings.filter((a) => a.status === "suspicious").length;
          const unknownOpen = openFindings.filter((a) => a.status === "unknown").length;
          if (confirmedOpen)
            recs.push({ action: `Block or inspect ${confirmedOpen} confirmed alert${confirmedOpen === 1 ? "" : "s"}`, priority: "high" });
          if (unknownOpen)
            recs.push({ action: `Review ${unknownOpen} unknown or unclassified connection${unknownOpen === 1 ? "" : "s"}`, priority: "medium" });''',
    1,
)

if 'test("protection recovery reconciles native desired state"' not in tests:
    tests += r'''

test("protection recovery reconciles native desired state", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const store = read("src/lib/security/store.ts");
  const vpn = read("android/app/src/main/java/app/kysmindset/security/KillVpnService.java");
  const boot = read("android/app/src/main/java/app/kysmindset/security/BootReceiver.java");
  assert.match(manifest, /android\.intent\.action\.MY_PACKAGE_REPLACED/);
  assert.match(vpn, /KEY_DESIRED/);
  assert.match(vpn, /restoreIfDesired/);
  assert.match(boot, /KillVpnService\.restoreIfDesired\(context\)/);
  assert.match(store, /restoredKillSwitch = get\(\)\.killSwitch \|\| Boolean\(native\?\.vpnDesired\)/);
  assert.match(store, /devicePosture: native/);
});

test("scan results separate alerts review and weakened posture", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  const store = read("src/lib/security/store.ts");
  assert.match(overview, /Alerts · confirmed suspicious/);
  assert.match(overview, /Needs review · unknown \/ unclassified/);
  assert.match(overview, />Weakened</);
  assert.doesNotMatch(overview, /Alerts & review items/);
  assert.match(store, /confirmedOpen/);
  assert.match(store, /unknownOpen/);
  assert.doesNotMatch(store, /vulns\.push\(\{ name: .*third-party/i);
});
'''

MANIFEST.write_text(manifest)
STORE.write_text(store)
OVERVIEW.write_text(overview)
TESTS.write_text(tests)
