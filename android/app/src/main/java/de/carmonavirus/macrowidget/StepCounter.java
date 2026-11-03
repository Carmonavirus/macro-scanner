package de.carmonavirus.macrowidget;

import android.content.Context;
import android.content.SharedPreferences;

import java.time.LocalDate;

/**
 * Turns the phone's step sensor into "steps today".
 *
 * The sensor only reports the total number of steps since the phone was last
 * switched on. We remember the reading at the start of the day (the last reading
 * before midnight) and add up across restarts, the same way step counter apps do.
 */
final class StepCounter {
    private StepCounter() {}

    private static SharedPreferences p(Context c) { return Data.prefs(c); }

    static boolean enabled(Context c) { return p(c).getBoolean("sc_on", false); }

    static void setEnabled(Context c, boolean on) { p(c).edit().putBoolean("sc_on", on).apply(); }

    /** Record a sensor reading; returns the steps counted today. */
    static synchronized long record(Context c, long counter) {
        SharedPreferences prefs = p(c);
        String today = LocalDate.now().toString();
        String day = prefs.getString("sc_day", null);
        long last = prefs.getLong("sc_last", -1);
        long base = prefs.getLong("sc_base", counter);
        long acc = prefs.getLong("sc_acc", 0);
        if (day == null || last < 0) {
            // First reading ever: start counting from now.
            day = today; base = counter; acc = 0;
        } else if (!today.equals(day)) {
            // New day: steps after the last reading of yesterday count for today.
            day = today; acc = 0;
            base = counter >= last ? last : 0;
        } else if (counter < last) {
            // The phone restarted: the sensor began again at 0.
            acc += last - base;
            base = 0;
        }
        prefs.edit().putString("sc_day", day).putLong("sc_base", base).putLong("sc_acc", acc)
            .putLong("sc_last", counter).putLong("sc_at", System.currentTimeMillis()).apply();
        return Math.max(0, acc + counter - base);
    }

    /** Steps counted today, or -1 when counting is off. */
    static long today(Context c) {
        if (!enabled(c)) return -1;
        SharedPreferences prefs = p(c);
        if (!LocalDate.now().toString().equals(prefs.getString("sc_day", null))) return 0;
        long last = prefs.getLong("sc_last", -1);
        if (last < 0) return 0;
        return Math.max(0, prefs.getLong("sc_acc", 0) + last - prefs.getLong("sc_base", last));
    }
}
