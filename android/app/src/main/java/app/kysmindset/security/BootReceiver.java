package app.kysmindset.security;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        boolean boot = Intent.ACTION_BOOT_COMPLETED.equals(action);
        boolean replaced = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (!boot && !replaced) return;

        DeviceOwner.applyLockPolicies(context);
        if (LockGateService.deviceLockOn(context)) {
            try {
                Intent svc = new Intent(context, LockGateService.class);
                svc.setAction(LockGateService.ACTION_START);
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(svc);
                else context.startService(svc);
            } catch (Exception ignored) {
            }
        }

        KillVpnService.restoreIfDesired(context);
    }
}
