package de.carmonavirus.macrowidget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts step counting again after the phone restarts or the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            StepService.startIfEnabled(c);
        }
    }
}
