# Kysmindset 2.0

Android security-control dashboard built around a simple mindset: **observe what is actually visible, verify before labeling, control deliberately, and recover cleanly**. It includes a real VPN kill tunnel, native device-posture checks, app-session request controls, PIN/biometric lock, and optional Device Admin / Device Owner integration.

**There is no default PIN.** Set a 4–8 digit PIN in Config → Lock PIN.

## What this build actually does

- Android `VpnService` kill tunnel that drops captured IPv4/IPv6 traffic while allowing selected apps to bypass it.
- Native posture checks for Android/API/security patch, secure screen lock, debugger, developer/ADB state, common root indicators, emulator indicators, biometrics, notification/battery state, VPN state, and Device Admin/Owner state.
- Rule-based security analysis of observable posture and Kysmindset's own web/network session.
- PBKDF2-HMAC-SHA256 PIN verifier with retry lockout plus Android biometric unlock.
- Device Admin lock support and optional advanced Device Owner / lock-task support.
- WebViewAssetLoader-based local UI boundary so external pages do not inherit the privileged JavaScript bridge.
- SHA-256 and package-identity verification before self-update installation.

## What it does not pretend to do

It is **not currently a full antivirus engine**. It does not scan every file/APK on the phone, inspect arbitrary app memory, or enumerate every Android process. Unknown hosts are not automatically labeled malware. The analysis engine is rule-based, not AI.

See [`SECURITY_REALITY_CHECK.md`](./SECURITY_REALITY_CHECK.md) for the detailed truth/limitations pass.

## Android test APK

GitHub Actions builds `app-debug.apk` as the development package:

`app.kysmindset.security.dev`

That lets this overhaul install alongside an older `app.kysmindset.security` build rather than failing because an old APK was signed with a different key. The checked-in key signs only the development package and must not be treated as a production signing key.

The workflow publishes the latest debug APK to the `apk-latest` GitHub release and includes its SHA-256 in the release notes.

## Device lock

Device lock is **off by default**. Enabling a lock-screen replacement is a deliberate opt-in because it changes normal phone behavior.

For a normal personal phone you can use Device Admin without Device Owner:

1. Install/open the APK.
2. Go to Config → Device lock.
3. Enable Device Admin when Android asks.
4. Enable the device lock screen option.

Device Admin can lock the phone and let Kysmindset appear over the keyguard. It cannot permanently replace Android's system lock screen or silently grant Device Owner powers.

## Device Owner (advanced)

Device Owner is subject to Android provisioning rules and is normally only available on a fresh/unprovisioned device. The app displays the exact ADB command for the installed package. The debug build uses `.dev`, so do not use an old hard-coded package command.

## Development

```bash
npm ci
npm run check
```

The Android build uses Java 17, Android Gradle Plugin 8.7.3, Gradle 8.9, compile/target SDK 35, and min SDK 26.
