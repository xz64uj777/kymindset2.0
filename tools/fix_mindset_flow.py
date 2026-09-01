from pathlib import Path

# 1) Make the four mindset actions explicit and visible where they act.
p = Path("src/components/security/overview-panel.tsx")
text = p.read_text()
needle = '''  const copySnapshot = async () => {'''
insert = '''  const scrollToPanel = (title: string) => {
    const sections = Array.from(document.querySelectorAll("section"));
    const target = sections.find((section) => section.querySelector("h3")?.textContent?.trim() === title);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copySnapshot = async () => {'''
if needle not in text:
    raise SystemExit("overview helper anchor not found")
text = text.replace(needle, insert, 1)
text = text.replace('''              onClick: () => void runSecurityAnalysis(),''', '''              onClick: () => {
                void runSecurityAnalysis();
                window.setTimeout(() => scrollToPanel("Security Analysis Engine"), 60);
              },''', 1)
text = text.replace('''              onClick: () => setTab("network"),''', '''              onClick: () => {
                setTab("network");
                toast.message("Review unknown and suspicious network activity before deciding.");
              },''', 1)
text = text.replace('''              onClick: () => (killSwitch ? setTab("network") : toggleKillSwitch()),''', '''              onClick: () => {
                if (!killSwitch) {
                  toggleKillSwitch();
                  toast.message("Starting protection — approve Android VPN if prompted.");
                } else {
                  scrollToPanel("Protection state");
                  toast.message("Protection is active. Use Stop Protection or Network for detailed controls.");
                }
              },''', 1)
text = text.replace('''              detail: "Keep lock, update, and protection state easy to restore.",
              action: "Open recovery",
              disabled: false,
              onClick: () => setTab("config"),''', '''              detail: "Return to a known-good state without silently disabling protection.",
              action: "Recovery actions",
              disabled: false,
              onClick: () => {
                scrollToPanel("Actions");
                toast.message("Recovery actions are below: release protection, clear resolved items, or refresh monitors.");
              },''', 1)
p.write_text(text)

# 2) Suppress auto-lock while an Android system permission sheet belongs to Kymindset.
p = Path("src/lib/native.ts")
text = p.read_text()
needle = '''function androidBridge(): AndroidBridge | null {
  const a = (window as unknown as { KysAndroid?: AndroidBridge }).KysAndroid;
  return a ?? null;
}
'''
replacement = '''function androidBridge(): AndroidBridge | null {
  const a = (window as unknown as { KysAndroid?: AndroidBridge }).KysAndroid;
  return a ?? null;
}

let nativePromptUntil = 0;

function beginNativePrompt(ms = 120_000) {
  nativePromptUntil = Math.max(nativePromptUntil, Date.now() + ms);
}

function endNativePromptSoon() {
  window.setTimeout(() => {
    nativePromptUntil = 0;
  }, 1500);
}

export function isNativePromptActive() {
  return Date.now() < nativePromptUntil;
}
'''
if needle not in text:
    raise SystemExit("native bridge anchor not found")
text = text.replace(needle, replacement, 1)
needle = '''    const finish = (v: "on" | "off" | "denied" | "app") => {
      if (done) return;
      done = true;
      resolve(v);
    };'''
replacement = '''    const finish = (v: "on" | "off" | "denied" | "app") => {
      if (done) return;
      done = true;
      endNativePromptSoon();
      resolve(v);
    };'''
if needle not in text:
    raise SystemExit("setDeviceKill finish anchor not found")
text = text.replace(needle, replacement, 1)
needle = '''    try {
      setKill(on);'''
replacement = '''    try {
      if (on) beginNativePrompt();
      setKill(on);'''
if needle not in text:
    raise SystemExit("setKill call anchor not found")
text = text.replace(needle, replacement, 1)
# Biometric system UI should get the same treatment.
needle = '''    try {
      android.biometric();'''
replacement = '''    try {
      beginNativePrompt(90_000);
      android.biometric();'''
if needle in text:
    text = text.replace(needle, replacement, 1)
needle = '''        finish(d === "ok" || d === "unavailable" ? d : "fail");'''
replacement = '''        endNativePromptSoon();
        finish(d === "ok" || d === "unavailable" ? d : "fail");'''
if needle in text:
    text = text.replace(needle, replacement, 1)
p.write_text(text)

# 3) Auto-lock should ignore system UI that Kymindset itself opened.
p = Path("src/components/security/dashboard.tsx")
text = p.read_text()
text = text.replace('''import { isStandalone, requestWakeLock, setAppBadge } from "@/lib/native";''', '''import { isNativePromptActive, isStandalone, requestWakeLock, setAppBadge } from "@/lib/native";''', 1)
needle = '''      if (document.visibilityState === "hidden" && isStandalone()) lock();'''
replacement = '''      if (document.visibilityState === "hidden" && isStandalone() && !isNativePromptActive()) lock();'''
if needle not in text:
    raise SystemExit("auto-lock anchor not found")
text = text.replace(needle, replacement, 1)
p.write_text(text)

# 4) Regression tests for both problems.
p = Path("tests/security-contract.test.mjs")
text = p.read_text()
addition = r'''

test("mindset actions reveal their result instead of acting invisibly", () => {
  const overview = read("src/components/security/overview-panel.tsx");
  assert.match(overview, /scrollToPanel\("Security Analysis Engine"\)/);
  assert.match(overview, /scrollToPanel\("Protection state"\)/);
  assert.match(overview, /scrollToPanel\("Actions"\)/);
});

test("Android permission sheets do not trigger standalone auto-lock", () => {
  const native = read("src/lib/native.ts");
  const dashboard = read("src/components/security/dashboard.tsx");
  assert.match(native, /export function isNativePromptActive/);
  assert.match(native, /beginNativePrompt\(\)/);
  assert.match(dashboard, /!isNativePromptActive\(\)/);
});
'''
if "mindset actions reveal their result instead of acting invisibly" not in text:
    text += addition
p.write_text(text)
