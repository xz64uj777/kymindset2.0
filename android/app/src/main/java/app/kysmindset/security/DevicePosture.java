package app.kysmindset.security;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Debug;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.biometric.BiometricManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.Locale;

/**
 * Best-effort device posture signals exposed to the local WebView UI.
 * These are indicators, not proof that a device is clean or compromised.
 */
final class DevicePosture {
    private static final String[] SU_PATHS = {
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/data/local/su",
        "/su/bin/su",
        "/data/adb/magisk"
    };

    private DevicePosture() {}

    static String json(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            JSONArray rootEvidence = rootEvidence();
            JSONArray emulatorEvidence = emulatorEvidence();
            boolean debuggable = (ctx.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            boolean debugger = Debug.isDebuggerConnected() || Debug.waitingForDebugger();
            boolean deviceSecure = false;
            try {
                KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
                deviceSecure = km != null && km.isDeviceSecure();
            } catch (Exception ignored) {
            }

            int authenticators =
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.BIOMETRIC_WEAK;
            int biometric = BiometricManager.from(ctx).canAuthenticate(authenticators);
            boolean developerOptions = false;
            boolean adbEnabled = false;
            boolean notificationsEnabled = true;
            boolean batteryOptimized = true;
            try {
                developerOptions = Settings.Global.getInt(
                    ctx.getContentResolver(), Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1;
                adbEnabled = Settings.Global.getInt(
                    ctx.getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
            } catch (Exception ignored) {
            }
            try {
                NotificationManager nm =
                    (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                notificationsEnabled = nm == null || nm.areNotificationsEnabled();
            } catch (Exception ignored) {
            }
            try {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                batteryOptimized = pm == null || !pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            } catch (Exception ignored) {
            }

            o.put("android", true);
            o.put("api", Build.VERSION.SDK_INT);
            o.put("release", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
            o.put("securityPatch", Build.VERSION.SECURITY_PATCH == null ? "" : Build.VERSION.SECURITY_PATCH);
            o.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
            o.put("model", Build.MODEL == null ? "" : Build.MODEL);
            o.put("debuggable", debuggable);
            o.put("debuggerAttached", debugger);
            o.put("deviceSecure", deviceSecure);
            o.put("biometricAvailable", biometric == BiometricManager.BIOMETRIC_SUCCESS);
            o.put("developerOptionsEnabled", developerOptions);
            o.put("adbEnabled", adbEnabled);
            o.put("notificationsEnabled", notificationsEnabled);
            o.put("batteryOptimized", batteryOptimized);
            o.put("rootSignals", rootEvidence.length() > 0);
            o.put("rootEvidence", rootEvidence);
            o.put("emulatorSignals", emulatorEvidence.length() > 0);
            o.put("emulatorEvidence", emulatorEvidence);
            o.put("vpnActive", KillVpnService.active);
            o.put("vpnDesired", KillVpnService.desired(ctx));
            o.put("vpnDesired", KillVpnService.desired(ctx));
            o.put("vpnDesired", KillVpnService.desired(ctx));
            o.put("deviceAdmin", DeviceOwner.isAdmin(ctx));
            o.put("deviceOwner", DeviceOwner.isOwner(ctx));
            o.put("lockTaskPermitted", DeviceOwner.lockTaskPermitted(ctx));
            o.put("packageName", ctx.getPackageName());
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    private static JSONArray rootEvidence() {
        JSONArray out = new JSONArray();
        try {
            String tags = Build.TAGS;
            if (tags != null && tags.contains("test-keys")) out.put("build:test-keys");
        } catch (Exception ignored) {
        }
        for (String path : SU_PATHS) {
            try {
                if (new File(path).exists()) out.put(path);
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    private static JSONArray emulatorEvidence() {
        JSONArray out = new JSONArray();
        String fingerprint = lower(Build.FINGERPRINT);
        String model = lower(Build.MODEL);
        String manufacturer = lower(Build.MANUFACTURER);
        String brand = lower(Build.BRAND);
        String device = lower(Build.DEVICE);
        String product = lower(Build.PRODUCT);
        String hardware = lower(Build.HARDWARE);

        if (fingerprint.startsWith("generic") || fingerprint.contains("emulator") || fingerprint.contains("vbox")) {
            out.put("fingerprint");
        }
        if (model.contains("google_sdk") || model.contains("emulator") || model.contains("android sdk built for")) {
            out.put("model");
        }
        if (manufacturer.contains("genymotion")) out.put("manufacturer");
        if ((brand.startsWith("generic") && device.startsWith("generic")) || product.contains("sdk") || product.contains("emulator")) {
            out.put("product");
        }
        if (hardware.contains("goldfish") || hardware.contains("ranchu") || hardware.contains("vbox")) {
            out.put("hardware");
        }
        return out;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.US);
    }
}
