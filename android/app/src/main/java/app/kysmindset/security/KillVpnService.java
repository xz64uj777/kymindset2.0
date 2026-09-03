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
