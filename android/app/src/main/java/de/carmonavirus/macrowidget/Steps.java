package de.carmonavirus.macrowidget;

import android.annotation.TargetApi;
import android.content.Context;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.StepsRecord;
import android.os.Build;
import android.os.OutcomeReceiver;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Today's step count from Health Connect (built into Android 14 and newer).
 * Health Connect adds up the steps from every app that writes them (Samsung Health,
 * Google Fit, the phone's own step counter, a watch app…) without counting twice.
 */
final class Steps {
    static final String READ_STEPS = "android.permission.health.READ_STEPS";
    static final String READ_IN_BACKGROUND = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND";

    private Steps() {}

    /** Health Connect is part of the system from Android 14 on. */
    static boolean supported() {
        return Build.VERSION.SDK_INT >= 34;
    }

    static boolean allowed(Context c) {
        return supported() && c.checkSelfPermission(READ_STEPS) == PackageManager.PERMISSION_GRANTED;
    }

    /** Permissions to ask for: reading steps, and on Android 15+ also while the app is in the background. */
    static String[] permissions() {
        return Build.VERSION.SDK_INT >= 35 ? new String[] {READ_STEPS, READ_IN_BACKGROUND} : new String[] {READ_STEPS};
    }

    /** Steps since midnight, or -1 when they can't be read (no permission, no Health Connect, not allowed in background). */
    static long today(Context c) {
        if (!allowed(c)) return -1;
        try {
            return read(c);
        } catch (Throwable t) {
            return -1;
        }
    }

    @TargetApi(34)
    private static long read(Context c) throws InterruptedException {
        HealthConnectManager hc = c.getSystemService(HealthConnectManager.class);
        if (hc == null) return -1;
        Instant start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant();
        AggregateRecordsRequest<Long> req = new AggregateRecordsRequest.Builder<Long>(
                new TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(Instant.now()).build())
            .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL)
            .build();
        AtomicLong out = new AtomicLong(-1);
        CountDownLatch done = new CountDownLatch(1);
        hc.aggregate(req, Executors.newSingleThreadExecutor(),
            new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                @Override
                public void onResult(AggregateRecordsResponse<Long> r) {
                    Long v = r.get(StepsRecord.STEPS_COUNT_TOTAL);
                    out.set(v == null ? 0 : v);
                    done.countDown();
                }

                @Override
                public void onError(HealthConnectException e) {
                    done.countDown();
                }
            });
        done.await(10, TimeUnit.SECONDS);
        return out.get();
    }
}
