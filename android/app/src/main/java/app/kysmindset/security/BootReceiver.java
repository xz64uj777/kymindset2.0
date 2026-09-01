package app.kysmindset.security;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(a)) {
            return;
        }
        DeviceOwner.applyLockPolicies(context);
        if (!LockGateService.deviceLockOn(context)) return;
        Intent svc = new Intent(context, LockGateService.class);
        svc.setAction(LockGateService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(svc);
        else context.startService(svc);
    }
}
