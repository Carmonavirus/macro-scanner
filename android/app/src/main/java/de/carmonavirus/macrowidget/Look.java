package de.carmonavirus.macrowidget;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;

/** How the widget looks: text size, background, light or dark, what it shows. Set in LookActivity. */
final class Look {
    private static final String PREFS = "look";

    static final int THEME_PHONE = 0, THEME_LIGHT = 1, THEME_DARK = 2;

    int textSize = 100;        // percent, 80–160
    int opacity = 100;         // background, percent, 0–100
    int theme = THEME_PHONE;
    boolean showLeft = false;  // big numbers show what's left instead of what's eaten
    boolean showBar = true, showTiles = true, showSteps = true, showStatus = true, showRefresh = true;

    static Look load(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Look l = new Look();
        l.textSize = p.getInt("textSize", l.textSize);
        l.opacity = p.getInt("opacity", l.opacity);
        l.theme = p.getInt("theme", l.theme);
        l.showLeft = p.getBoolean("showLeft", l.showLeft);
        l.showBar = p.getBoolean("showBar", l.showBar);
        l.showTiles = p.getBoolean("showTiles", l.showTiles);
        l.showSteps = p.getBoolean("showSteps", l.showSteps);
        l.showStatus = p.getBoolean("showStatus", l.showStatus);
        l.showRefresh = p.getBoolean("showRefresh", l.showRefresh);
        return l;
    }

    void save(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt("textSize", textSize).putInt("opacity", opacity).putInt("theme", theme)
            .putBoolean("showLeft", showLeft).putBoolean("showBar", showBar).putBoolean("showTiles", showTiles)
            .putBoolean("showSteps", showSteps).putBoolean("showStatus", showStatus).putBoolean("showRefresh", showRefresh)
            .apply();
    }

    static void reset(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    boolean night(Context c) {
        if (theme == THEME_LIGHT) return false;
        if (theme == THEME_DARK) return true;
        return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
    }

    float sp(float base) { return base * textSize / 100f; }

    // Same colours as res/values and res/values-night, so the widget can be forced light or dark.
    static int card(boolean night)  { return night ? 0xFF1C1C1C : 0xFFFFFFFF; }
    static int text(boolean night)  { return night ? 0xFFECECEC : 0xFF1F1F1F; }
    static int muted(boolean night) { return night ? 0xFFA3A3A3 : 0xFF5B5B5B; }
    static int track(boolean night) { return night ? 0xFF3A3A3A : 0xFFE2E2E2; }
}
