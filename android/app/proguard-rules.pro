# Kysmindset release hardening
-keepclassmembers class app.kysmindset.security.MainActivity$KysBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.kysmindset.security.KysDeviceAdminReceiver { *; }
