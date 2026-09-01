package app.kysmindset.security;

import android.app.ActivityOptions;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class LockGateService extends Service {
    public static final String PREFS = "kysmindset-lock";
    public static final String KEY_DEVICE_LOCK = "deviceLock";
    public static final String ACTION_START = "app.kysmindset.security.LOCK_GATE_START";
    public static final String ACTION_STOP = "app.kysmindset.security.LOCK_GATE_STOP";
    private static final String CHANNEL = "kys-lock";
    private static final int NOTIF = 42;

    public static boolean active = false;
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String a = intent.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                MainActivity.requestLock(context);
                DeviceOwner.lockNow(context);
            } else if (Intent.ACTION_SCREEN_ON.equals(a) || Intent.ACTION_USER_PRESENT.equals(a)) {
                if (!deviceLockOn(context)) return;
                Intent launch = new Intent(context, MainActivity.class);
                launch.setAction("app.kysmindset.security.LOCK");
                launch.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                );
                Bundle opts = null;
                if (Build.VERSION.SDK_INT >= 27) {
                    ActivityOptions options = ActivityOptions.makeBasic();
                    try {
                        ActivityOptions.class
                            .getMethod("setShowWhenLocked", boolean.class)
                            .invoke(options, true);
                    } catch (Exception ignored) {
                    }
                    if (Build.VERSION.SDK_INT >= 28 && DeviceOwner.isOwner(context)) {
                        try {
                            options.setLockTaskEnabled(true);
                        } catch (Exception ignored) {
                        }
                    }
                    opts = options.toBundle();
                }
                if (opts != null) context.startActivity(launch, opts);
                else context.startActivity(launch);
            }
        }
    };

    public static boolean deviceLockOn(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        return p.getBoolean(KEY_DEVICE_LOCK, false);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch =
                new NotificationChannel(CHANNEL, "Lock screen", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screen, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screen, f);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            active = false;
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        active = true;
        DeviceOwner.applyLockPolicies(this);
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi =
            PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        Notification n =
            new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Kysmindset lock")
                .setContentText("Watching screen off — tap to open the lock screen")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentIntent(pi)
                .setOngoing(true)
                .setSilent(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIF, n);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            unregisterReceiver(screen);
        } catch (Exception ignored) {
        }
        active = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
