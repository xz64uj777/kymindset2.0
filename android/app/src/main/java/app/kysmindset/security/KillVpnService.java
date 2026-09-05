package app.kysmindset.security;

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
