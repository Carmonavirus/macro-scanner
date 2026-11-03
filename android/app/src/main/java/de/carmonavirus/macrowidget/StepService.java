package de.carmonavirus.macrowidget;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.IBinder;

import java.util.Locale;

/**
 * Counts steps with the phone's step sensor, like a step counter app.
 * Android only delivers step sensor readings to apps that are running, so this
 * runs as a small foreground service with a silent notification.
 */
public class StepService extends Service implements SensorEventListener {
    private static final String CHANNEL = "steps";
    private static final int NOTIFICATION = 1;
    private long lastDraw;

    /** True when this phone has a step counter sensor. */
    static boolean hasSensor(Context c) {
        SensorManager sm = c.getSystemService(SensorManager.class);
        return sm != null && sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null;
    }

    static boolean permitted(Context c) {
        return Build.VERSION.SDK_INT < 29
            || c.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Start counting if the user turned it on and it's allowed. Safe to call often. */
    static void startIfEnabled(Context c) {
        if (!StepCounter.enabled(c) || !permitted(c) || !hasSensor(c)) return;
        try {
            c.startForegroundService(new Intent(c, StepService.class));
        } catch (Exception ignored) {
            // Android may refuse to start it from the background; it starts next time the app opens.
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, StepService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Step counter", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shown while Macro Widget counts your steps");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification n = notification(Math.max(0, StepCounter.today(this)));
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH);
        } else {
            startForeground(NOTIFICATION, n);
        }
        SensorManager sm = getSystemService(SensorManager.class);
        Sensor s = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (s == null) { stopSelf(); return; }
        // Readings may be batched for up to a minute to save battery.
        sm.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL, 60_000_000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        SensorManager sm = getSystemService(SensorManager.class);
        if (sm != null) sm.unregisterListener(this);
        super.onDestroy();
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        long today = StepCounter.record(this, (long) e.values[0]);
        long now = System.currentTimeMillis();
        if (now - lastDraw < 60_000) return;
        lastDraw = now;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION, notification(today));
        MacroWidget.drawAll(this);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private Notification notification(long steps) {
        PendingIntent open = PendingIntent.getActivity(this, 3, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_steps)
            .setContentTitle(String.format(Locale.getDefault(), "%,d steps today", steps))
            .setContentText("Macro Widget is counting your steps")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(open)
            .build();
    }
}
