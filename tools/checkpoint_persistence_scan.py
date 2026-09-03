from pathlib import Path

ROOT = Path('.')
VPN = ROOT / 'android/app/src/main/java/app/kysmindset/security/KillVpnService.java'
BOOT = ROOT / 'android/app/src/main/java/app/kysmindset/security/BootReceiver.java'
MAIN = ROOT / 'android/app/src/main/java/app/kysmindset/security/MainActivity.java'
POSTURE = ROOT / 'android/app/src/main/java/app/kysmindset/security/DevicePosture.java'
MANIFEST = ROOT / 'android/app/src/main/AndroidManifest.xml'
NATIVE = ROOT / 'src/lib/native.ts'
STORE = ROOT / 'src/lib/security/store.ts'
OVERVIEW = ROOT / 'src/components/security/overview-panel.tsx'
TESTS = ROOT / 'tests/security-contract.test.mjs'

VPN.write_text(r'''package app.kysmindset.security;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import java.io.FileInputStream;

public class KillVpnService extends VpnService {
    public static final String ACTION_STOP = "app.kysmindset.security.STOP_VPN";
    public static final String ACTION_RESTART = "app.kysmindset.security.RESTART_VPN";
    public static final String PREFS = "kys";
    public static final String KEY_ALLOW = "vpn_allow";
    public static final String KEY_DESIRED = "vpn_desired";
    private static final String CH = "kys-airgap";
    public static volatile boolean active;
    private ParcelFileDescriptor tun;
    private volatile boolean running;

    public static boolean desired(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DESIRED, false);
    }

    private static void setDesired(Context context, boolean desired) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DESIRED, desired).apply();
    }

    public static boolean restoreIfDesired(Context context) {
        if (!desired(context) || active) return active;
        try {
            if (VpnService.prepare(context) != null) return false;
            Intent i = new Intent(context, KillVpnService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i);
            else context.startService(i);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            setDesired(this, false);
            stopTunnel();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null && !desired(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundNote();
        if (ACTION_RESTART.equals(action)) stopTunnel();
        return startTunnel() ? START_STICKY : START_NOT_STICKY;
    }

    private void startForegroundNote() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CH, "Kysmindset protection", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        int nAllow = allowCount();
        String text = nAllow == 0
            ? "Protection active · block by default"
            : "Protection active · " + nAllow + " app" + (nAllow == 1 ? "" : "s") + " allowed";
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CH)
            : new Notification.Builder(this);
        Notification n = b.setContentTitle("Kysmindset network protection")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(41, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(41, n);
        }
    }

    private int allowCount() {
        String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_ALLOW, "");
        if (raw == null || raw.trim().isEmpty()) return 0;
        int n = 0;
        for (String p : raw.split("\\n")) if (!p.trim().isEmpty()) n++;
        return n;
    }

    private boolean startTunnel() {
        if (tun != null) return true;
        Builder b = new Builder();
        b.setSession("Kysmindset Air Gap");
        b.setMtu(1500);
        b.addAddress("10.8.0.2", 32);
        b.addRoute("0.0.0.0", 0);
        try {
            b.addAddress("fd00::2", 128);
            b.addRoute("::", 0);
        } catch (Exception ignored) {
        }
        try {
            b.addDisallowedApplication(getPackageName());
        } catch (Exception ignored) {
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String raw = prefs.getString(KEY_ALLOW, "");
        if (raw != null) {
            for (String pkg : raw.split("\\n")) {
                String p = pkg.trim();
                if (p.isEmpty() || p.equals(getPackageName())) continue;
                try {
                    b.addDisallowedApplication(p);
                } catch (Exception ignored) {
                }
            }
        }
        b.setBlocking(true);
        try {
            tun = b.establish();
        } catch (Exception ignored) {
            tun = null;
        }
        if (tun == null) {
            active = false;
            stopForeground(true);
            stopSelf();
            return false;
        }
        setDesired(this, true);
        running = true;
        active = true;
        Thread t = new Thread(
            () -> {
                try (FileInputStream in = new FileInputStream(tun.getFileDescriptor())) {
                    byte[] buf = new byte[32767];
                    while (running) {
                        int n = in.read(buf);
                        if (n <= 0) break;
                    }
                } catch (Exception ignored) {
                }
            },
            "kys-drop");
        t.start();
        return true;
    }

    private void stopTunnel() {
        running = false;
        try {
            if (tun != null) tun.close();
        } catch (Exception ignored) {
        }
        tun = null;
        active = false;
        stopForeground(true);
    }

    @Override
    public void onDestroy() {
        stopTunnel();
        super.onDestroy();
    }

    @Override
    public void onRevoke() {
        setDesired(this, false);
        stopTunnel();
        stopSelf();
    }
}
''')

BOOT.write_text(r'''package app.kysmindset.security;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        boolean boot = Intent.ACTION_BOOT_COMPLETED.equals(action);
        boolean replaced = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (!boot && !replaced) return;

        DeviceOwner.applyLockPolicies(context);
        if (LockGateService.deviceLockOn(context)) {
            try {
                Intent svc = new Intent(context, LockGateService.class);
                svc.setAction(LockGateService.ACTION_START);
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(svc);
                else context.startService(svc);
            } catch (Exception ignored) {
            }
        }

        KillVpnService.restoreIfDesired(context);
    }
}
''')

main = MAIN.read_text()
main = main.replace(
'''        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
        startLockGate();
        handleLockIntent(getIntent());
        handleUpdateIntent(getIntent());
''',
'''        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
        startLockGate();
        KillVpnService.restoreIfDesired(this);
        handleLockIntent(getIntent());
        handleUpdateIntent(getIntent());
''',
1)
main = main.replace(
'''    private void startVpn() {
        Intent i = new Intent(this, KillVpnService.class);
        startService(i);
        sendKill("on");
    }
''',
'''    private void startVpn() {
        Intent i = new Intent(this, KillVpnService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
        else startService(i);
        if (web != null) {
            web.postDelayed(() -> sendKill(KillVpnService.active ? "on" : "denied"), 600L);
        } else {
            sendKill(KillVpnService.active ? "on" : "denied");
        }
    }
''',
1)
main = main.replace(
'''    protected void onResume() {
        super.onResume();
        if (gated) hideSystemBars();
        DeviceOwner.applyLockPolicies(this);
    }
''',
'''    protected void onResume() {
        super.onResume();
        if (gated) hideSystemBars();
        DeviceOwner.applyLockPolicies(this);
        KillVpnService.restoreIfDesired(this);
    }
''',
1)
MAIN.write_text(main)

posture = POSTURE.read_text()
posture = posture.replace(
'            o.put("vpnActive", KillVpnService.active);\n',
'            o.put("vpnActive", KillVpnService.active);\n            o.put("vpnDesired", KillVpnService.desired(ctx));\n',
1)
POSTURE.write_text(posture)

manifest = MANIFEST.read_text()
manifest = manifest.replace(
'''            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
''',
'''            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
''',
1)
MANIFEST.write_text(manifest)

native = NATIVE.read_text()
native = native.replace(
'  vpnActive: boolean;\n',
'  vpnActive: boolean;\n  vpnDesired: boolean;\n',
1)
NATIVE.write_text(native)

store = STORE.read_text()
store = store.replace(
'''          if (snap.thirdPartyHosts.length)
            vulns.push({
              name: `${snap.thirdPartyHosts.length} third-party host${snap.thirdPartyHosts.length === 1 ? "" : "s"} in this session`,
              severity: snap.thirdPartyHosts.length > 3 ? "high" : "medium",
            });
''',
'''          if (snap.thirdPartyHosts.length)
            recs.push({
              action: `Review ${snap.thirdPartyHosts.length} third-party connection${snap.thirdPartyHosts.length === 1 ? "" : "s"} before allowing`,
              priority: "medium",
            });
''',
1)
store = store.replace(
'''            if (!native.deviceSecure)
              recs.push({ action: "Enable a secure Android screen lock", priority: "high" });
''',
'''            if (!native.deviceSecure) {
              vulns.push({ name: "Android secure screen lock is off", severity: "high" });
              recs.push({ action: "Enable a secure Android screen lock", priority: "high" });
            }
''',
1)
store = store.replace(
'''                s.score >= 85
                  ? "This origin is tight. Residual risk is third-party hosts and permissions."
                  : s.score >= 70
                    ? "Fair posture. Block unknown hosts and keep decoys armed."
                    : "Elevated posture deductions. Review open traffic and restore protection flags.",
''',
'''                s.score >= 85
                  ? "No confirmed scan alerts. Review third-party connections and permissions as needed."
                  : s.score >= 70
                    ? "Fair posture. Review unknown hosts and restore any weakened controls."
                    : "Elevated posture deductions. Review open traffic and restore weakened protection.",
''',
1)
STORE.write_text(store)

overview = OVERVIEW.read_text()
overview = overview.replace(
'import { isDeviceVpnActive } from "@/lib/native";\n',
'import { readDevicePosture } from "@/lib/native";\n',
1)
overview = overview.replace(
'''  const [deviceVpn, setDeviceVpn] = useState<boolean | null>(() => isDeviceVpnActive());
  useEffect(() => {
    const sync = () => setDeviceVpn(isDeviceVpnActive());
    sync();
    const id = window.setInterval(sync, 1500);
    return () => window.clearInterval(id);
  }, [killSwitch]);
''',
'''  const initialPosture = readDevicePosture();
  const [deviceVpn, setDeviceVpn] = useState<boolean | null>(() => initialPosture?.vpnActive ?? null);
  const [deviceVpnDesired, setDeviceVpnDesired] = useState(() => initialPosture?.vpnDesired ?? false);
  useEffect(() => {
    const sync = () => {
      const posture = readDevicePosture();
      setDeviceVpn(posture?.vpnActive ?? null);
      setDeviceVpnDesired(posture?.vpnDesired ?? false);
    };
    sync();
    const id = window.setInterval(sync, 1500);
    return () => window.clearInterval(id);
  }, [killSwitch]);
''',
1)
overview = overview.replace(
'''  const scanHeadline = threats.length
    ? "Alerts found"
    : reviewItems.length || weakenedCount
      ? "Protection weakened"
      : "No action needed";
''',
'''  const scanHeadline = threats.length
    ? "Alerts found"
    : weakenedCount
      ? "Protection weakened"
      : reviewItems.length
        ? "Review needed"
        : "No action needed";
''',
1)
overview = overview.replace(
'''            <div className={cn("mt-1 text-sm font-semibold", deviceVpn === true ? "text-emerald" : deviceVpn === false ? "text-amber" : "text-muted")}>
              {deviceVpn === true ? "Active" : deviceVpn === false ? "Inactive" : "Unavailable in this runtime"}
            </div>
''',
'''            <div
              className={cn(
                "mt-1 text-sm font-semibold",
                deviceVpn === true ? "text-emerald" : deviceVpnDesired ? "text-amber" : deviceVpn === false ? "text-muted" : "text-muted",
              )}
            >
              {deviceVpn === true
                ? "Active"
                : deviceVpnDesired
                  ? "Interrupted — recovery pending"
                  : deviceVpn === false
                    ? "Inactive"
                    : "Unavailable in this runtime"}
            </div>
''',
1)
overview = overview.replace(
'''          <div className="grid gap-2 sm:grid-cols-3">
''',
'''          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
''',
1)
overview = overview.replace(
'''            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Needs review / weakened</div>
              <div className={cn("mt-1 text-sm font-semibold", reviewItems.length || weakenedCount ? "text-amber" : "text-emerald")}>
                {reviewItems.length + weakenedCount}
              </div>
            </div>
''',
'''            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Review</div>
              <div className={cn("mt-1 text-sm font-semibold", reviewItems.length ? "text-amber" : "text-emerald")}>
                {reviewItems.length}
              </div>
            </div>
            <div className="rounded-md border border-line bg-elevated p-3">
              <div className="text-2xs uppercase tracking-wide text-subtle">Weakened</div>
              <div className={cn("mt-1 text-sm font-semibold", weakenedCount ? "text-amber" : "text-emerald")}>
                {weakenedCount}
              </div>
            </div>
''',
1)
OVERVIEW.write_text(overview)

tests = TESTS.read_text()
if 'test("native VPN desired state survives service lifecycle"' not in tests:
    tests += r'''

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
'''
TESTS.write_text(tests)
