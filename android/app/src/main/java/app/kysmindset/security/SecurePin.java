package app.kysmindset.security;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

final class SecurePin {
    private static final String PREFS = "kys_auth";
    private static final String KEY_SALT = "pin_salt";
    private static final String KEY_HASH = "pin_hash";
    private static final String KEY_FAILS = "pin_fails";
    private static final String KEY_LOCKED_UNTIL = "pin_locked_until";
    private static final int ITERATIONS = 120_000;
    private static final int BITS = 256;

    private SecurePin() {}

    static boolean hasPin(Context ctx) {
        return prefs(ctx).contains(KEY_HASH) && prefs(ctx).contains(KEY_SALT);
    }

    static boolean set(Context ctx, String pin) {
        if (pin == null || !pin.matches("\\d{4,8}")) return false;
        try {
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            byte[] hash = derive(pin.toCharArray(), salt);
            prefs(ctx).edit()
                .putString(KEY_SALT, Base64.encodeToString(salt, Base64.NO_WRAP))
                .putString(KEY_HASH, Base64.encodeToString(hash, Base64.NO_WRAP))
                .putInt(KEY_FAILS, 0)
                .putLong(KEY_LOCKED_UNTIL, 0L)
                .apply();
            Arrays.fill(hash, (byte) 0);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    static boolean verify(Context ctx, String pin) {
        SharedPreferences p = prefs(ctx);
        long now = System.currentTimeMillis();
        if (now < p.getLong(KEY_LOCKED_UNTIL, 0L)) return false;
        if (!hasPin(ctx) || pin == null) return false;
        try {
            byte[] salt = Base64.decode(p.getString(KEY_SALT, ""), Base64.NO_WRAP);
            byte[] expected = Base64.decode(p.getString(KEY_HASH, ""), Base64.NO_WRAP);
            byte[] actual = derive(pin.toCharArray(), salt);
            boolean ok = constantTimeEquals(expected, actual);
            Arrays.fill(actual, (byte) 0);
            if (ok) {
                p.edit().putInt(KEY_FAILS, 0).putLong(KEY_LOCKED_UNTIL, 0L).apply();
                return true;
            }
        } catch (Exception ignored) {
        }
        registerFailure(p, now);
        return false;
    }

    static long retryAfterMs(Context ctx) {
        return Math.max(0L, prefs(ctx).getLong(KEY_LOCKED_UNTIL, 0L) - System.currentTimeMillis());
    }

    private static void registerFailure(SharedPreferences p, long now) {
        int fails = p.getInt(KEY_FAILS, 0) + 1;
        long lockMs = fails >= 10 ? 300_000L : fails >= 7 ? 60_000L : fails >= 5 ? 15_000L : 0L;
        p.edit().putInt(KEY_FAILS, fails).putLong(KEY_LOCKED_UNTIL, now + lockMs).apply();
    }

    private static byte[] derive(char[] pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin, salt, ITERATIONS, BITS);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec)
                .getEncoded();
        } finally {
            spec.clearPassword();
            Arrays.fill(pin, '\0');
        }
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a == null || b == null) return false;
        int diff = a.length ^ b.length;
        int max = Math.max(a.length, b.length);
        for (int i = 0; i < max; i++) {
            byte av = i < a.length ? a[i] : 0;
            byte bv = i < b.length ? b[i] : 0;
            diff |= av ^ bv;
        }
        return diff == 0;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
