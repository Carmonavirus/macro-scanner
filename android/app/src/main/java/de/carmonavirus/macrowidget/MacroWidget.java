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
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;

/** Home screen widget: today's kcal, protein, carbs and fat. */
public class MacroWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "de.carmonavirus.macrowidget.REFRESH";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        StepService.startIfEnabled(c);
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

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Data.Today t = Data.cached(c);
        Look look = Look.load(c);
        boolean night = look.night(c);
        boolean modern = Build.VERSION.SDK_INT >= 31;

        // kcal header: what's eaten, or with "show what's left" what's left of the goal
        if (t.gKcal > 0) {
            long diff = Math.round(t.gKcal - t.kcal);
            if (look.showLeft) {
                v.setTextViewText(R.id.kcal, String.valueOf(Math.abs(diff)));
                v.setTextViewText(R.id.kcal_goal, diff >= 0 ? "kcal left" : "kcal over");
                v.setTextViewText(R.id.kcal_left, Math.round(t.kcal) + " / " + Math.round(t.gKcal) + " eaten");
            } else {
                v.setTextViewText(R.id.kcal, String.valueOf(Math.round(t.kcal)));
                v.setTextViewText(R.id.kcal_goal, "/ " + Math.round(t.gKcal) + " kcal");
                v.setTextViewText(R.id.kcal_left, diff >= 0 ? diff + " left" : (-diff) + " over");
            }
        } else {
            v.setTextViewText(R.id.kcal, String.valueOf(Math.round(t.kcal)));
            v.setTextViewText(R.id.kcal_goal, "kcal");
            v.setTextViewText(R.id.kcal_left, "");
        }
        v.setProgressBar(R.id.bar_kcal, 1000, progress(t.kcal, t.gKcal), false);
        if (modern && t.accent != null) {
            v.setColorStateList(R.id.bar_kcal, "setProgressTintList", ColorStateList.valueOf(Color.parseColor(t.accent)));
        }

        tile(v, t, look, night, R.id.tile_protein, R.id.val_protein, R.id.goal_protein, R.id.bar_protein, t.protein, t.gProtein, t.cProtein, modern);
        tile(v, t, look, night, R.id.tile_carbs, R.id.val_carbs, R.id.goal_carbs, R.id.bar_carbs, t.carbs, t.gCarbs, t.cCarbs, modern);
        tile(v, t, look, night, R.id.tile_fat, R.id.val_fat, R.id.goal_fat, R.id.bar_fat, t.fat, t.gFat, t.cFat, modern);

        // status line
        String status;
        boolean update = Data.connected(c) && Data.updateAvailable(c);
        if (!Data.connected(c)) status = "Tap to open Macro Widget and connect";
        else if (update) status = "New widget version \u00B7 tap here to update";
        else if (t.error != null) status = t.error;
        else if (t.updatedAt == 0) status = "Loading…";
        else status = "Updated " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(t.updatedAt));
        v.setTextViewText(R.id.status, status);

        // steps from Health Connect (only when the user allowed it)
        if (t.steps >= 0 && look.showSteps) {
            v.setTextViewText(R.id.steps, "\uD83D\uDC5F " + String.format(Locale.getDefault(), "%,d", t.steps) + " steps \u00B7 \u2248 "
                + Data.stepKcal(t.steps, t.weight, t.height) + " kcal");
            v.setViewVisibility(R.id.steps, android.view.View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.steps, android.view.View.GONE);
        }

        applyLook(v, look, night, modern);
        if (update) v.setViewVisibility(R.id.status, View.VISIBLE);   // always say when a new version is out

        // taps: the widget opens Macro Scanner (or this app to connect), the arrows refresh
        // OpenApp picks the installed app over the browser when it's there.
        Intent open = new Intent(c, Data.connected(c) ? OpenApp.class : MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        if (update) {
            Intent upd = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(R.id.status, PendingIntent.getActivity(c, 3, upd,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        Intent refresh = new Intent(c, MacroWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(c, 2, refresh,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    private static void tile(RemoteViews v, Data.Today t, Look look, boolean night, int tileId, int valId, int goalId, int barId,
                             double value, double goal, String colour, boolean modern) {
        if (look.showLeft && goal > 0) {
            double diff = goal - value;
            v.setTextViewText(valId, fmt(Math.abs(diff)));
            v.setTextViewText(goalId, diff >= 0 ? "g left" : "g over");
        } else {
            v.setTextViewText(valId, fmt(value));
            v.setTextViewText(goalId, goal > 0 ? "/ " + fmt(goal) + " g" : "g");
        }
        v.setProgressBar(barId, 1000, progress(value, goal), false);
        boolean reached = goal > 0 && value >= goal;
        v.setInt(tileId, "setBackgroundResource", reached
            ? (night ? R.drawable.tile_reached_dark : R.drawable.tile_reached_light)
            : (night ? R.drawable.tile_dark : R.drawable.tile_light));
        if (modern) {
            if (colour != null) v.setColorStateList(barId, "setProgressTintList", ColorStateList.valueOf(Color.parseColor(colour)));
            if (reached && t.goal != null) {
                v.setColorStateList(tileId, "setBackgroundTintList", ColorStateList.valueOf(goalBackground(night, t.goal)));
            } else {
                v.setColorStateList(tileId, "setBackgroundTintList", null);
            }
        }
    }

    /** The app's goal colour, softened onto the card like the app does. */
    private static int goalBackground(boolean night, String hex) {
        int g = Color.parseColor(hex);
        int base = night ? 0xFF1C1C1C : 0xFFFFFFFF;
        float a = night ? 0.25f : 0.22f;
        return Color.rgb(
            Math.round(Color.red(g) * a + Color.red(base) * (1 - a)),
            Math.round(Color.green(g) * a + Color.green(base) * (1 - a)),
            Math.round(Color.blue(g) * a + Color.blue(base) * (1 - a)));
    }

    // Text views and their normal size in sp; the text size setting scales them.
    private static final int[] TEXT_IDS = { R.id.kcal, R.id.val_protein, R.id.val_carbs, R.id.val_fat,
        R.id.lbl_protein, R.id.lbl_carbs, R.id.lbl_fat, R.id.steps };
    private static final float[] TEXT_SP = { 24, 18, 18, 18, 12, 12, 12, 12 };
    private static final int[] MUTED_IDS = { R.id.kcal_goal, R.id.kcal_left, R.id.goal_protein, R.id.goal_carbs,
        R.id.goal_fat, R.id.status };
    private static final float[] MUTED_SP = { 13, 12, 11, 11, 11, 11 };
    private static final int[] BAR_IDS = { R.id.bar_kcal, R.id.bar_protein, R.id.bar_carbs, R.id.bar_fat };

    /** Text size, colours for light or dark, see-through background and which parts show. */
    private static void applyLook(RemoteViews v, Look look, boolean night, boolean modern) {
        int text = Look.text(night), muted = Look.muted(night);
        for (int i = 0; i < TEXT_IDS.length; i++) {
            v.setTextViewTextSize(TEXT_IDS[i], TypedValue.COMPLEX_UNIT_SP, look.sp(TEXT_SP[i]));
            v.setTextColor(TEXT_IDS[i], text);
        }
        for (int i = 0; i < MUTED_IDS.length; i++) {
            v.setTextViewTextSize(MUTED_IDS[i], TypedValue.COMPLEX_UNIT_SP, look.sp(MUTED_SP[i]));
            v.setTextColor(MUTED_IDS[i], muted);
        }
        v.setInt(R.id.bg, "setColorFilter", Look.card(night));
        v.setInt(R.id.bg, "setImageAlpha", Math.round(look.opacity * 2.55f));
        if (modern) {
            ColorStateList track = ColorStateList.valueOf(Look.track(night));
            for (int id : BAR_IDS) v.setColorStateList(id, "setProgressBackgroundTintList", track);
            v.setColorStateList(R.id.refresh, "setImageTintList", ColorStateList.valueOf(muted));
        }
        v.setViewVisibility(R.id.bar_kcal, look.showBar ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.tiles, look.showTiles ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.status, look.showStatus ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.refresh, look.showRefresh ? View.VISIBLE : View.GONE);
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
