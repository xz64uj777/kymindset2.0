package app.kysmindset.security;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class AppUpdate {
    public static final String RELEASE_API =
        "https://api.github.com/repos/xz64uj777/kymindset2.0/releases/tags/apk-latest";
    public static final String APK_URL =
        "https://github.com/xz64uj777/kymindset2.0/releases/download/apk-latest/app-debug.apk";
    public static final String ACTION_INSTALLED = "app.kysmindset.security.UPDATE_INSTALLED";

    public interface Sink {
        void emit(String json);
    }

    private AppUpdate() {}

    public static int localCode(Context ctx) {
        try {
            PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return p.versionCode;
        } catch (Exception e) {
            return 1;
        }
    }

    public static String localName(Context ctx) {
        try {
            PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return p.versionName != null ? p.versionName : "1.0.0";
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    public static String versionJson(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            o.put("android", true);
            o.put("code", localCode(ctx));
            o.put("name", localName(ctx));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    public static void check(Context ctx, Sink sink) {
        new Thread(
                () -> {
                    try {
                        JSONObject rel = fetchJson(RELEASE_API);
                        int remote = parseRemoteCode(rel);
                        int local = localCode(ctx);
                        String url = apkUrl(rel);
                        JSONObject o = new JSONObject();
                        o.put("state", remote > local ? "available" : "current");
                        o.put("local", local);
                        o.put("remote", remote);
                        o.put("name", localName(ctx));
                        o.put("published", rel.optString("published_at", ""));
                        o.put("updated", rel.optString("updated_at", ""));
                        o.put("url", url);
                        sink.emit(o.toString());
                    } catch (Exception e) {
                        sink.emit(err("check-fail", e.getMessage()));
                    }
                })
            .start();
    }

    public static void install(Context ctx, Sink sink) {
        new Thread(
                () -> {
                    File apk = new File(new File(ctx.getCacheDir(), "update"), "app-debug.apk");
                    try {
                        if (apk.getParentFile() != null) apk.getParentFile().mkdirs();
                        JSONObject rel = fetchJson(RELEASE_API);
                        String expectedSha = parseSha256(rel);
                        if (expectedSha.isEmpty()) {
                            sink.emit(err("bad-release", "Release is missing a SHA-256 checksum"));
                            return;
                        }
                        String src = apkUrl(rel);
                        sink.emit(progress("download", 0));
                        download(src, apk, sink);
                        if (!apk.isFile() || apk.length() < 10_000) {
                            sink.emit(err("bad-apk", "Download was empty"));
                            return;
                        }
                        String actualSha = sha256(apk);
                        if (!expectedSha.equalsIgnoreCase(actualSha)) {
                            apk.delete();
                            sink.emit(err("bad-apk", "APK checksum did not match the published release"));
                            return;
                        }
                        if (!archiveMatchesPackage(ctx, apk)) {
                            apk.delete();
                            sink.emit(err("bad-apk", "APK package identity did not match this app"));
                            return;
                        }
                        sink.emit(progress("install", 100));
                        if (Build.VERSION.SDK_INT >= 26
                            && !ctx.getPackageManager().canRequestPackageInstalls()) {
                            Intent perm =
                                new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            perm.setData(Uri.parse("package:" + ctx.getPackageName()));
                            perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            ctx.startActivity(perm);
                            sink.emit(err("need-permission", "Allow installs from Kysmindset, then tap Update again"));
                            return;
                        }
                        if (!installSession(ctx, apk)) installView(ctx, apk);
                        sink.emit(progress("prompt", 100));
                    } catch (Exception e) {
                        sink.emit(err("install-fail", e.getMessage()));
                    }
                })
            .start();
    }

    private static boolean installSession(Context ctx, File apk) {
        try {
            PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(ctx.getPackageName());
            if (Build.VERSION.SDK_INT >= 31) {
                params.setRequireUserAction(
                    PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
            }
            int id = installer.createSession(params);
            PackageInstaller.Session session = installer.openSession(id);
            try (InputStream in = new FileInputStream(apk);
                OutputStream out = session.openWrite("app.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            }
            Intent cb = new Intent(ctx, MainActivity.class);
            cb.setAction(ACTION_INSTALLED);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, id, cb, flags);
            session.commit(pi.getIntentSender());
            session.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static void installView(Context ctx, File apk) {
        Uri uri =
            FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".files", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }

    private static void download(String src, File dest, Sink sink) throws Exception {
        HttpURLConnection c = open(src);
        int code = c.getResponseCode();
        int hops = 0;
        while (code >= 300 && code < 400 && hops < 8) {
            String next = c.getHeaderField("Location");
            c.disconnect();
            if (next == null || next.isEmpty()) throw new Exception("redirect");
            c = open(next);
            code = c.getResponseCode();
            hops++;
        }
        if (code != 200) throw new Exception("HTTP " + code);
        long total = c.getContentLength();
        try (InputStream in = c.getInputStream();
            FileOutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[64 * 1024];
            long got = 0;
            int n;
            int last = -1;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                got += n;
                int pct = total > 0 ? (int) Math.min(99, (got * 100) / total) : 0;
                if (pct != last && pct % 5 == 0) {
                    last = pct;
                    sink.emit(progress("download", pct));
                }
            }
        } finally {
            c.disconnect();
        }
    }

    private static JSONObject fetchJson(String src) throws Exception {
        HttpURLConnection c = open(src);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            InputStream in = c.getInputStream();
            byte[] raw = readAll(in);
            return new JSONObject(new String(raw, StandardCharsets.UTF_8));
        } finally {
            c.disconnect();
        }
    }

    private static HttpURLConnection open(String src) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(src).openConnection();
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(15_000);
        c.setReadTimeout(60_000);
        c.setRequestProperty("User-Agent", "Kysmindset-Updater");
        c.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream, */*");
        return c;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        File tmp = null;
        try {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        } finally {
            if (tmp != null) {
                /* unused */
            }
        }
    }


    private static String parseSha256(JSONObject rel) {
        String body = rel.optString("body", "");
        Matcher m = Pattern.compile("sha256\\s*:\\s*([0-9a-fA-F]{64})").matcher(body);
        return m.find() ? m.group(1).toLowerCase() : "";
    }

    private static boolean archiveMatchesPackage(Context ctx, File apk) {
        try {
            PackageInfo p =
                ctx.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            return p != null && ctx.getPackageName().equals(p.packageName);
        } catch (Exception e) {
            return false;
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder out = new StringBuilder(64);
        for (byte b : md.digest()) out.append(String.format("%02x", b & 0xff));
        return out.toString();
    }

    private static int parseRemoteCode(JSONObject rel) {
        String body = rel.optString("body", "");
        Matcher m = Pattern.compile("versionCode\\s*:\\s*(\\d+)").matcher(body);
        if (m.find()) {
            try {
                return Integer.parseInt(m.group(1));
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    private static String apkUrl(JSONObject rel) {
        JSONArray assets = rel.optJSONArray("assets");
        if (assets != null) {
            for (int i = 0; i < assets.length(); i++) {
                JSONObject a = assets.optJSONObject(i);
                if (a == null) continue;
                String name = a.optString("name", "");
                if (name.endsWith(".apk")) {
                    String u = a.optString("browser_download_url", "");
                    if (!u.isEmpty()) return u;
                }
            }
        }
        return APK_URL;
    }

    private static String progress(String state, int pct) {
        JSONObject o = new JSONObject();
        try {
            o.put("state", state);
            o.put("pct", pct);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    private static String err(String state, String message) {
        JSONObject o = new JSONObject();
        try {
            o.put("state", state);
            o.put("error", message == null ? "error" : message);
        } catch (Exception ignored) {
        }
        return o.toString();
    }
}
