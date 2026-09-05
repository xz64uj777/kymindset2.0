from pathlib import Path

VPN = Path('android/app/src/main/java/app/kysmindset/security/KillVpnService.java')
POSTURE = Path('android/app/src/main/java/app/kysmindset/security/DevicePosture.java')
NATIVE = Path('src/lib/native.ts')
OVERVIEW = Path('src/components/security/overview-panel.tsx')
TESTS = Path('tests/security-contract.test.mjs')

vpn = r'''package app.kysmindset.security;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.VpnService;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.FileInputStream;

public class KillVpnService extends VpnService {
    public static final String ACTION_STOP = "app.kysmindset.security.STOP_VPN";
    public static final String ACTION_RESTART = "app.kysmindset.security.RESTART_VPN";
    public static final String PREFS = "kys";
    public static final String KEY_ALLOW = "vpn_allow";
    public static final String KEY_DESIRED = "vpn_desired";
    public static final String KEY_EVENTS = "vpn_events";
    public static final String KEY_RECOVERIES = "vpn_recoveries";
    private static final String CH = "kys-airgap";
    public static volatile boolean active;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ParcelFileDescriptor tun;
    private volatile boolean running;
    private boolean recoveryScheduled;
    private int recoveryBackoffStep;

    public static boolean desired(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DESIRED, false);
    }

    private static void setDesired(Context context, boolean desired) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DESIRED, desired).apply();
    }

    private static synchronized void record(Context context, String event, String detail) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray previous;
            try {
                previous = new JSONArray(prefs.getString(KEY_EVENTS, "[]"));
            } catch (Exception ignored) {
                previous = new JSONArray();
            }
            JSONArray next = new JSONArray();
            JSONObject row = new JSONObject();
            row.put("at", System.currentTimeMillis());
            row.put("event", event == null ? "Protection event" : event);
            row.put("detail", detail == null ? "" : detail);
            next.put(row);
            for (int i = 0; i < previous.length() && i < 19; i++) next.put(previous.opt(i));
            prefs.edit().putString(KEY_EVENTS, next.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private static int bumpRecovery(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int count = prefs.getInt(KEY_RECOVERIES, 0) + 1;
        prefs.edit().putInt(KEY_RECOVERIES, count).apply();
        return count;
    }

    public static JSONObject diagnostics(Context context) {
        JSONObject out = new JSONObject();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            out.put("active", active);
            out.put("desired", desired(context));
            out.put("recoveryAttempts", prefs.getInt(KEY_RECOVERIES, 0));
            JSONArray events;
            try {
                events = new JSONArray(prefs.getString(KEY_EVENTS, "[]"));
            } catch (Exception ignored) {
                events = new JSONArray();
            }
            out.put("events", events);
        } catch (Exception ignored) {
        }
        return out;
    }

    public static boolean restoreIfDesired(Context context) {
        if (!desired(context) || active) return active;
        try {
            if (VpnService.prepare(context) != null) {
                record(context, "Recovery blocked", "Android VPN permission is required before protection can resume.");
                return false;
            }
            int attempt = bumpRecovery(context);
            record(context, "Recovery requested", "Restoring Android VPN protection · attempt " + attempt + ".");
            Intent i = new Intent(context, KillVpnService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i);
            else context.startService(i);
            return true;
        } catch (Exception e) {
            record(context, "Recovery failed", safeMessage(e, "Android could not start the protection service."));
            return false;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            setDesired(this, false);
            recoveryScheduled = false;
            record(this, "Protection stopped", "Stopped from Kymindset.");
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
        String successEvent = ACTION_RESTART.equals(action)
            ? "Protection rebuilt"
            : desired(this) ? "Protection recovered" : "Protection started";
        boolean started = startTunnel(successEvent);
        return desired(this) || started ? START_STICKY : START_NOT_STICKY;
    }

    private void startForegroundNote() {
        int nAllow = allowCount();
        String text = nAllow == 0
            ? "Protection active · block by default"
            : "Protection active · " + nAllow + " app" + (nAllow == 1 ? "" : "s") + " allowed";
        startForegroundNote(text);
    }

    private void startForegroundNote(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CH, "Kysmindset protection", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
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

    private boolean startTunnel(String successEvent) {
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
        } catch (Exception e) {
            tun = null;
            record(this, "Tunnel start failed", safeMessage(e, "Android did not establish the VPN tunnel."));
        }
        if (tun == null) {
            active = false;
            if (desired(this)) {
                scheduleRecovery("Tunnel establishment failed");
            } else {
                stopForeground(true);
                stopSelf();
            }
            return false;
        }

        setDesired(this, true);
        recoveryScheduled = false;
        recoveryBackoffStep = 0;
        running = true;
        active = true;
        startForegroundNote();
        record(this, successEvent, "Android VPN tunnel is active · block by default.");

        final ParcelFileDescriptor tunnel = tun;
        Thread t = new Thread(
            () -> {
                String endReason = "Tunnel input closed unexpectedly.";
                try (FileInputStream in = new FileInputStream(tunnel.getFileDescriptor())) {
                    byte[] buf = new byte[32767];
                    while (running && tun == tunnel) {
                        int n = in.read(buf);
                        if (n <= 0) break;
                    }
                } catch (Exception e) {
                    endReason = safeMessage(e, "Tunnel input failed unexpectedly.");
                }
                final String detail = endReason;
                if (running && tun == tunnel) {
                    mainHandler.post(() -> handleUnexpectedTunnelEnd(tunnel, detail));
                }
            },
            "kys-drop");
        t.start();
        return true;
    }

    private void handleUnexpectedTunnelEnd(ParcelFileDescriptor ended, String detail) {
        if (!running || tun != ended) return;
        running = false;
        try {
            ended.close();
        } catch (Exception ignored) {
        }
        tun = null;
        active = false;
        record(this, "Protection interrupted", detail);
        if (desired(this)) scheduleRecovery(detail);
        else {
            stopForeground(true);
            stopSelf();
        }
    }

    private void scheduleRecovery(String reason) {
        if (!desired(this) || recoveryScheduled || active) return;
        recoveryScheduled = true;
        long delay = Math.min(30_000L, 1_000L << Math.min(recoveryBackoffStep, 5));
        recoveryBackoffStep++;
        startForegroundNote("Protection interrupted · retrying");
        record(this, "Recovery scheduled", "Retrying in " + Math.max(1L, delay / 1000L) + "s · " + reason);
        mainHandler.postDelayed(
            () -> {
                recoveryScheduled = false;
                if (!desired(this) || active) return;
                if (VpnService.prepare(this) != null) {
                    record(this, "Recovery blocked", "Android VPN permission must be granted again.");
                    stopForeground(true);
                    stopSelf();
                    return;
                }
                int attempt = bumpRecovery(this);
                record(this, "Recovery attempt", "Restarting Android VPN tunnel · attempt " + attempt + ".");
                startTunnel("Protection recovered");
            },
            delay);
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
    public void onTaskRemoved(Intent rootIntent) {
        if (desired(this) && active) {
            record(this, "App closed", "Protection remains active in the Android foreground service.");
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        boolean recoveryExpected = desired(this) && (running || active);
        stopTunnel();
        if (recoveryExpected) {
            record(this, "Service interrupted", "Android stopped the VPN service; sticky recovery is expected.");
        }
        super.onDestroy();
    }

    @Override
    public void onRevoke() {
        record(this, "VPN permission revoked", "Android revoked Kymindset VPN control. Protection requires permission again.");
        setDesired(this, false);
        recoveryScheduled = false;
        stopTunnel();
        stopSelf();
    }

    private static String safeMessage(Exception e, String fallback) {
        if (e == null || e.getMessage() == null || e.getMessage().trim().isEmpty()) return fallback;
        String message = e.getMessage().trim();
        return message.length() > 180 ? message.substring(0, 180) : message;
    }
}
'''
VPN.write_text(vpn)

posture = POSTURE.read_text()
needle = '            o.put("vpnDesired", KillVpnService.desired(ctx));\n'
insert = needle + '            o.put("vpnDiagnostics", KillVpnService.diagnostics(ctx));\n'
if '"vpnDiagnostics"' not in posture:
    if needle not in posture:
        raise SystemExit('DevicePosture VPN insertion point not found')
    posture = posture.replace(needle, insert, 1)
    POSTURE.write_text(posture)

native = NATIVE.read_text()
old = '''export type DevicePosture = {\n  android: boolean;'''
new = '''export type ProtectionDiagnosticEvent = { at: number; event: string; detail: string };\nexport type ProtectionDiagnostics = {\n  active: boolean;\n  desired: boolean;\n  recoveryAttempts: number;\n  events: ProtectionDiagnosticEvent[];\n};\n\nexport type DevicePosture = {\n  android: boolean;'''
if 'export type ProtectionDiagnosticEvent' not in native:
    if old not in native:
        raise SystemExit('native DevicePosture type insertion point not found')
    native = native.replace(old, new, 1)
needle = '  vpnDesired: boolean;\n'
if '  vpnDiagnostics?: ProtectionDiagnostics;\n' not in native:
    if needle not in native:
        raise SystemExit('native vpnDesired field not found')
    native = native.replace(needle, needle + '  vpnDiagnostics?: ProtectionDiagnostics;\n', 1)
NATIVE.write_text(native)

overview = OVERVIEW.read_text()
old_state = '''  const [deviceVpn, setDeviceVpn] = useState<boolean | null>(() => initialPosture?.vpnActive ?? null);\n  const [deviceVpnDesired, setDeviceVpnDesired] = useState(() => initialPosture?.vpnDesired ?? false);'''
new_state = '''  const [deviceVpn, setDeviceVpn] = useState<boolean | null>(() => initialPosture?.vpnActive ?? null);\n  const [deviceVpnDesired, setDeviceVpnDesired] = useState(() => initialPosture?.vpnDesired ?? false);\n  const [vpnDiagnostics, setVpnDiagnostics] = useState(() => initialPosture?.vpnDiagnostics ?? null);'''
if 'const [vpnDiagnostics' not in overview:
    if old_state not in overview:
        raise SystemExit('overview VPN state insertion point not found')
    overview = overview.replace(old_state, new_state, 1)
old_sync = '''      setDeviceVpn(posture?.vpnActive ?? null);\n      setDeviceVpnDesired(posture?.vpnDesired ?? false);'''
new_sync = '''      setDeviceVpn(posture?.vpnActive ?? null);\n      setDeviceVpnDesired(posture?.vpnDesired ?? false);\n      setVpnDiagnostics(posture?.vpnDiagnostics ?? null);'''
if 'setVpnDiagnostics(posture?.vpnDiagnostics' not in overview:
    if old_sync not in overview:
        raise SystemExit('overview VPN sync insertion point not found')
    overview = overview.replace(old_sync, new_sync, 1)

history_anchor = '''        <div className="mt-3 flex flex-wrap items-center gap-2">\n          <Button size="sm" onClick={toggleKillSwitch}>'''
history_block = '''        {vpnDiagnostics?.events?.length ? (\n          <div className="mt-3 rounded-md border border-line bg-elevated/50 p-3">\n            <div className="mb-2 flex items-center justify-between gap-3">\n              <div className="text-xs font-semibold text-fg">Protection history</div>\n              <div className="text-2xs text-subtle">Recovery attempts {vpnDiagnostics.recoveryAttempts}</div>\n            </div>\n            <div className="space-y-2">\n              {vpnDiagnostics.events.slice(0, 4).map((event, index) => (\n                <div key={`${event.at}-${event.event}-${index}`} className="flex items-start justify-between gap-3">\n                  <div className="min-w-0">\n                    <div className={cn("text-2xs font-medium", event.event.includes("interrupted") || event.event.includes("failed") || event.event.includes("revoked") || event.event.includes("blocked") ? "text-amber" : "text-fg")}>\n                      {event.event}\n                    </div>\n                    {event.detail ? <div className="mt-0.5 text-2xs text-subtle">{event.detail}</div> : null}\n                  </div>\n                  <div className="shrink-0 text-2xs text-subtle">{timeAgo(event.at)}</div>\n                </div>\n              ))}\n            </div>\n          </div>\n        ) : null}\n        <div className="mt-3 flex flex-wrap items-center gap-2">\n          <Button size="sm" onClick={toggleKillSwitch}>'''
if 'Protection history' not in overview:
    if history_anchor not in overview:
        raise SystemExit('overview protection history insertion point not found')
    overview = overview.replace(history_anchor, history_block, 1)
OVERVIEW.write_text(overview)

tests = TESTS.read_text()
if 'vpn tunnel interruption clears active state and schedules recovery' not in tests:
    tests += r'''

test("vpn tunnel interruption clears active state and schedules recovery", () => {
  const vpn = read("android/app/src/main/java/app/kysmindset/security/KillVpnService.java");
  assert.match(vpn, /handleUnexpectedTunnelEnd/);
  assert.match(vpn, /active = false/);
  assert.match(vpn, /scheduleRecovery/);
  assert.match(vpn, /Recovery scheduled/);
  assert.match(vpn, /START_STICKY/);
});

test("native protection diagnostics persist lifecycle history", () => {
  const vpn = read("android/app/src/main/java/app/kysmindset/security/KillVpnService.java");
  const posture = read("android/app/src/main/java/app/kysmindset/security/DevicePosture.java");
  const native = read("src/lib/native.ts");
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(vpn, /KEY_EVENTS/);
  assert.match(vpn, /VPN permission revoked/);
  assert.match(vpn, /Service interrupted/);
  assert.match(posture, /vpnDiagnostics/);
  assert.match(native, /ProtectionDiagnosticEvent/);
  assert.match(overview, /Protection history/);
  assert.match(overview, /Recovery attempts/);
});
'''
    TESTS.write_text(tests)
