# Kysmindset 2.0 — Security Reality Check

This document separates verified capabilities from things the app does **not** claim to do.

## What is real

- **Android VPN kill tunnel:** uses `VpnService` to capture routed IPv4/IPv6 traffic and intentionally discard it. Apps placed on the allow list are excluded from the VPN and continue using the normal network.
- **App request guard:** the web runtime patches `fetch`/XHR and can block third-party requests made by Kysmindset itself.
- **Native Android posture signals:** the APK reports Android version/API, security patch level, secure-lock status, biometric availability, debugger state, common root indicators, emulator indicators, VPN status, device-admin/device-owner status, and lock-task permission.
- **PIN protection:** native APK PINs use salted PBKDF2-HMAC-SHA256 with escalating retry lockout. No default PIN ships with the app.
- **Biometric unlock:** uses AndroidX BiometricPrompt in the APK.
- **Device Admin / Device Owner hooks:** can request device-admin privileges and can apply stronger lock-task/keyguard policies when the app is actually provisioned as Device Owner.
- **Hardened local WebView boundary:** app UI loads through `WebViewAssetLoader`; external navigation is sent to another app instead of loading inside the privileged WebView that owns the JavaScript bridge.
- **Update integrity:** updater requires the GitHub release to publish a SHA-256, verifies the downloaded APK checksum, and verifies the APK package identity before invoking Android's installer.
- **Stable development APK signature:** debug builds use a checked-in development-only key and the `.dev` application ID. This avoids the previous "update instead of install" signature collision with older builds. The dev key is intentionally not a production trust key.

## What is not a malware scanner

Kysmindset does **not** currently scan every APK/file on the phone for malware, run YARA/AV signatures, inspect another app's memory, or enumerate all Android processes. Android does not grant a normal app unrestricted access to those things.

The security analysis is a **rule-based posture analysis**, not an AI model. It combines signals Kysmindset can actually observe. Unknown third-party hosts are shown as **unclassified**, not automatically called malicious.

## Important limitations

- Root detection is best-effort. "No root indicators" is not proof a device is unrooted.
- Emulator detection is heuristic and can produce false positives/negatives.
- Browser/WebView resource timing shows traffic initiated by the Kysmindset UI, not all device sockets.
- The app's in-origin decoy paths are local traps. A hit shows that a path was requested; it is not automatically proof of an external intrusion.
- Device Owner cannot simply be granted like a normal permission on an already provisioned personal phone. Android provisioning rules apply.
- The debug APK is for testing. A public production release needs a private release signing key stored outside the repository (for example in GitHub Actions secrets).

## Trust rule

When the UI cannot measure something, it should say so. Kysmindset 2.0 favors a smaller set of defensible signals over impressive-looking numbers that cannot be justified.
