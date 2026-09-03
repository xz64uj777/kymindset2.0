from pathlib import Path

MAIN = Path("android/app/src/main/java/app/kysmindset/security/MainActivity.java")
UPDATE = Path("android/app/src/main/java/app/kysmindset/security/AppUpdate.java")
TESTS = Path("tests/security-contract.test.mjs")

main = MAIN.read_text()
update = UPDATE.read_text()
tests = TESTS.read_text()

if "import android.content.pm.PackageInstaller;" not in main:
    main = main.replace(
        "import android.content.pm.PackageManager;\n",
        "import android.content.pm.PackageInstaller;\nimport android.content.pm.PackageManager;\n",
        1,
    )

main = main.replace(
    "        handleLockIntent(getIntent());\n    }\n",
    "        handleLockIntent(getIntent());\n        handleUpdateIntent(getIntent());\n    }\n",
    1,
)

main = main.replace(
    "        setIntent(intent);\n        handleLockIntent(intent);\n    }\n",
    "        setIntent(intent);\n        handleLockIntent(intent);\n        handleUpdateIntent(intent);\n    }\n",
    1,
)

marker = "    @Override\n    protected void onNewIntent(Intent intent) {"
insert = '''    private void handleUpdateIntent(Intent intent) {
        if (intent == null || !AppUpdate.ACTION_INSTALLED.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = installerConfirmationIntent(intent);
            if (confirm != null) {
                beginExpectedSystemUi();
                try {
                    startActivity(confirm);
                    sendUpdate("{\\\"state\\\":\\\"prompt\\\",\\\"pct\\\":100}");
                } catch (Exception e) {
                    endExpectedSystemUi();
                    sendUpdate(updateErrorJson("Could not open Android installer: " + e.getMessage()));
                }
                return;
            }
        }

        endExpectedSystemUi();
        if (status == PackageInstaller.STATUS_SUCCESS) {
            sendUpdate("{\\\"state\\\":\\\"installed\\\",\\\"pct\\\":100}");
            return;
        }
        String detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (detail == null || detail.trim().isEmpty()) detail = "Android installer returned status " + status;
        sendUpdate(updateErrorJson(detail));
    }

    @SuppressWarnings("deprecation")
    private Intent installerConfirmationIntent(Intent result) {
        if (Build.VERSION.SDK_INT >= 33) {
            return result.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
        }
        return (Intent) result.getParcelableExtra(Intent.EXTRA_INTENT);
    }

    private String updateErrorJson(String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("state", "install-fail");
            out.put("error", message == null ? "Install failed" : message);
        } catch (Exception ignored) {
        }
        return out.toString();
    }

'''
if "private void handleUpdateIntent(Intent intent)" not in main:
    main = main.replace(marker, insert + marker, 1)

if "USER_ACTION_NOT_REQUIRED" in update:
    update = update.replace(
        "PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED",
        "PackageInstaller.SessionParams.USER_ACTION_REQUIRED",
    )

if 'test("self-update surfaces Android installer confirmation"' not in tests:
    tests += r'''

test("self-update surfaces Android installer confirmation", () => {
  const main = read("android/app/src/main/java/app/kysmindset/security/MainActivity.java");
  const update = read("android/app/src/main/java/app/kysmindset/security/AppUpdate.java");
  assert.match(main, /PackageInstaller\.EXTRA_STATUS/);
  assert.match(main, /PackageInstaller\.STATUS_PENDING_USER_ACTION/);
  assert.match(main, /Intent\.EXTRA_INTENT/);
  assert.match(main, /startActivity\(confirm\)/);
  assert.match(main, /handleUpdateIntent\(getIntent\(\)\)/);
  assert.match(main, /handleUpdateIntent\(intent\)/);
  assert.match(update, /USER_ACTION_REQUIRED/);
  assert.doesNotMatch(update, /USER_ACTION_NOT_REQUIRED/);
});
'''

MAIN.write_text(main)
UPDATE.write_text(update)
TESTS.write_text(tests)
