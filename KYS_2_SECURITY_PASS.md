# Kysmindset 2.0 — Security Credibility Pass

This pass prioritizes claim accuracy and security posture over visual polish.

## Changed

- Replaced product-facing “AI Security Engine” claims with **Security Analysis Engine** and rule-based wording.
- Removed fixed “AI Recommendation · Confidence” copy.
- Added an explicit protection-state section separating:
  - **Android · Device VPN**
  - **App · Network guard**
  - **VPN · Allowed apps**
- Reworded kill-switch and lock-screen copy so app-originated request blocking is not presented as proof of a device-wide “air gap.”
- Device VPN status is read from the native Android bridge (`KillVpnService.active`).
- Unknown third-party hosts are labeled **unclassified** and are no longer scored as confirmed threats by the main posture score.
- Browser/process telemetry is labeled app-only/browser-derived rather than presented as Android process enumeration.
- Disabled Android application backups and cleartext traffic.
- Added a Network Security Config that disallows cleartext by default.
- Hardened WebView settings:
  - file access off
  - content access off
  - mixed content denied
  - Safe Browsing enabled
  - universal access from file URLs disabled
- Removed unused broad storage/media permissions and `QUERY_ALL_PACKAGES`. Launcher discovery remains declared via `<queries>`.
- Replaced the shipped `1234` PIN with first-run PIN setup.
- Added native PIN verification using a random salt + PBKDF2-HMAC-SHA256, constant-time comparison, and escalating retry lockouts.
- Zustand no longer persists a plaintext PIN. The old `kysmindset-v4` store is discarded during migration.
- Browser/PWA PIN fallback uses WebCrypto PBKDF2 and is explicitly described as lower assurance.
- Added zero-dependency security contract tests and `test`, `typecheck`, and `check` npm scripts.

## Verification performed here

`npm test` passes all security contract tests.

A complete TypeScript/Vite build was **not** verified in this sandbox because the project dependencies are not installed in `node_modules`. `npm run typecheck` therefore reports missing package/type declarations, and `npm run build` cannot invoke the local Vite binary. Run `npm ci && npm run check` in a normal development environment before release.

## Still not solved

This is not yet a full endpoint-security engine. Traffic intelligence is still mainly app/WebView telemetry plus the Android discard VPN. It does not yet provide packet metadata inspection, DNS reputation, certificate analysis, malicious-IP reputation, package-signature analysis, or behavioral anomaly detection. Those should be native services with explicit data-source labels if added.
