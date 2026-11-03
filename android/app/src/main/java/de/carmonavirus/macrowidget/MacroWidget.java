package de.carmonavirus.macrowidget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;

/** Home screen widget: today's kcal, protein, carbs and fat. */
public class MacroWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "de.carmonavirus.macrowidget.REFRESH";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        drawAll(c);
        refreshInBackground(c);
        RefreshJob.schedule(c);
    }

    @Override
    public void onEnabled(Context c) { RefreshJob.schedule(c); }

    @Override
    public void onDisabled(Context c) { RefreshJob.cancel(c); }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            RemoteViews busy = new RemoteViews(c.getPackageName(), R.layout.widget);
            busy.setTextViewText(R.id.status, "Updating…");
            AppWidgetManager.getInstance(c).partiallyUpdateAppWidget(ids(c), busy);
            refreshInBackground(c);
        }
    }

    private void refreshInBackground(Context c) {
        final PendingResult r = goAsync();
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try { Data.refresh(app); drawAll(app); } finally { r.finish(); }
        }).start();
    }

    static int[] ids(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, MacroWidget.class));
    }

    /** Redraw every placed widget from the cached numbers. */
    static void drawAll(Context c) {
        int[] ids = ids(c);
        if (ids.length == 0) return;
        AppWidgetManager.getInstance(c).updateAppWidget(ids, build(c));
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Data.Today t = Data.cached(c);
        boolean modern = Build.VERSION.SDK_INT >= 31;

        // kcal header
        v.setTextViewText(R.id.kcal, String.valueOf(Math.round(t.kcal)));
        v.setTextViewText(R.id.kcal_goal, t.gKcal > 0 ? "/ " + Math.round(t.gKcal) + " kcal" : "kcal");
        if (t.gKcal > 0) {
            long diff = Math.round(t.gKcal - t.kcal);
            v.setTextViewText(R.id.kcal_left, diff >= 0 ? diff + " left" : (-diff) + " over");
        } else {
            v.setTextViewText(R.id.kcal_left, "");
        }
        v.setProgressBar(R.id.bar_kcal, 1000, progress(t.kcal, t.gKcal), false);
        if (modern && t.accent != null) {
            v.setColorStateList(R.id.bar_kcal, "setProgressTintList", ColorStateList.valueOf(Color.parseColor(t.accent)));
        }

        tile(c, v, t, R.id.tile_protein, R.id.val_protein, R.id.goal_protein, R.id.bar_protein, t.protein, t.gProtein, t.cProtein, modern);
        tile(c, v, t, R.id.tile_carbs, R.id.val_carbs, R.id.goal_carbs, R.id.bar_carbs, t.carbs, t.gCarbs, t.cCarbs, modern);
        tile(c, v, t, R.id.tile_fat, R.id.val_fat, R.id.goal_fat, R.id.bar_fat, t.fat, t.gFat, t.cFat, modern);

        // status line
        String status;
        if (!Data.connected(c)) status = "Tap to open Macro Widget and connect";
        else if (t.error != null) status = t.error;
        else if (t.updatedAt == 0) status = "Loading…";
        else status = "Updated " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(t.updatedAt));
        v.setTextViewText(R.id.status, status);

        // steps from Health Connect (only when the user allowed it)
        if (t.steps >= 0) {
            v.setTextViewText(R.id.steps, "\uD83D\uDC5F " + String.format(Locale.getDefault(), "%,d", t.steps) + " steps");
            v.setViewVisibility(R.id.steps, android.view.View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.steps, android.view.View.GONE);
        }

        // taps: the widget opens Macro Scanner (or this app to connect), the arrows refresh
        // OpenApp picks the installed app over the browser when it's there.
        Intent open = new Intent(c, Data.connected(c) ? OpenApp.class : MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Intent refresh = new Intent(c, MacroWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(c, 2, refresh,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    private static void tile(Context c, RemoteViews v, Data.Today t, int tileId, int valId, int goalId, int barId,
                             double value, double goal, String colour, boolean modern) {
        v.setTextViewText(valId, fmt(value));
        v.setTextViewText(goalId, goal > 0 ? "/ " + fmt(goal) + " g" : "g");
        v.setProgressBar(barId, 1000, progress(value, goal), false);
        boolean reached = goal > 0 && value >= goal;
        v.setInt(tileId, "setBackgroundResource", reached ? R.drawable.tile_reached : R.drawable.tile);
        if (modern) {
            if (colour != null) v.setColorStateList(barId, "setProgressTintList", ColorStateList.valueOf(Color.parseColor(colour)));
            if (reached && t.goal != null) {
                v.setColorStateList(tileId, "setBackgroundTintList", ColorStateList.valueOf(goalBackground(c, t.goal)));
            } else {
                v.setColorStateList(tileId, "setBackgroundTintList", null);
            }
        }
    }

    /** The app's goal colour, softened onto the card like the app does. */
    private static int goalBackground(Context c, String hex) {
        int g = Color.parseColor(hex);
        boolean night = (c.getResources().getConfiguration().uiMode
            & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        int base = night ? 0xFF1C1C1C : 0xFFFFFFFF;
        float a = night ? 0.25f : 0.22f;
        return Color.rgb(
            Math.round(Color.red(g) * a + Color.red(base) * (1 - a)),
            Math.round(Color.green(g) * a + Color.green(base) * (1 - a)),
            Math.round(Color.blue(g) * a + Color.blue(base) * (1 - a)));
    }

    private static int progress(double value, double goal) {
        if (goal <= 0) return 0;
        return (int) Math.max(0, Math.min(1000, Math.round(value / goal * 1000)));
    }

    /** German style: whole numbers from 10 up, one decimal with a comma below. */
    static String fmt(double n) {
        if (n >= 10 || n == 0) return String.valueOf(Math.round(n));
        return String.format(Locale.GERMANY, "%.1f", n);
    }
}
