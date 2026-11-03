package de.carmonavirus.macrowidget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/**
 * Reads the Macro Scanner backup from the user's secret GitHub Gist and works out
 * today's totals. The result is cached in SharedPreferences so the widget can draw
 * instantly; a refresh fetches the gist again.
 */
final class Data {
    static final String APP_URL = "https://carmonavirus.github.io/macro-scanner/";
    private static final String FILE = "macro-scanner-backup.json";
    /** Daily step counts, written by this app next to the backup so Macro Scanner can show them. */
    private static final String STEPS_FILE = "macro-scanner-steps.json";
    private static final String PREFS = "macro";

    private Data() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean connected(Context c) {
        return prefs(c).getString("token", null) != null;
    }

    /** Snapshot of what the widget shows. */
    static final class Today {
        String date;
        double kcal, protein, carbs, fat;
        double gKcal, gProtein, gCarbs, gFat;      // 0 = no goal
        String accent, goal, cProtein, cCarbs, cFat; // custom colours from the app, or null
        long updatedAt;
        long steps = -1;          // -1 = unknown
        long stepsAt;
        double weight, height;    // from the app's goals screen, 0 = not set
        String error;
    }

    static Today cached(Context c) {
        SharedPreferences p = prefs(c);
        Today t = new Today();
        t.date = p.getString("date", null);
        t.kcal = p.getFloat("kcal", 0); t.protein = p.getFloat("protein", 0);
        t.carbs = p.getFloat("carbs", 0); t.fat = p.getFloat("fat", 0);
        t.gKcal = p.getFloat("gKcal", 0); t.gProtein = p.getFloat("gProtein", 0);
        t.gCarbs = p.getFloat("gCarbs", 0); t.gFat = p.getFloat("gFat", 0);
        t.accent = p.getString("accent", null); t.goal = p.getString("goalColor", null);
        t.cProtein = p.getString("cProtein", null); t.cCarbs = p.getString("cCarbs", null); t.cFat = p.getString("cFat", null);
        t.updatedAt = p.getLong("updatedAt", 0);
        t.weight = p.getFloat("weight", 0); t.height = p.getFloat("height", 0);
        t.error = p.getString("error", null);
        if (LocalDate.now().toString().equals(p.getString("stepsDate", null))) {
            t.steps = p.getLong("steps", -1);
            t.stepsAt = p.getLong("stepsAt", 0);
        }
        // The phone's own step sensor (if counting is on). Use whichever source saw more steps.
        long counted = StepCounter.today(c);
        if (counted > t.steps) {
            t.steps = counted;
            t.stepsAt = p.getLong("sc_at", 0);
        }
        // A new day started since the last fetch: show zeros until we know better.
        if (t.date != null && !t.date.equals(LocalDate.now().toString())) {
            t.kcal = t.protein = t.carbs = t.fat = 0;
        }
        return t;
    }

    /** Connect with a token: finds the backup gist. Throws with a readable message on failure. */
    static void connect(Context c, String token) throws Exception {
        String gistId = findGist(token);
        if (gistId == null) {
            throw new Exception("No Macro Scanner backup found in this GitHub account. Turn on cloud backup in the app first (More › Automatic cloud backup).");
        }
        prefs(c).edit().putString("token", token).putString("gist", gistId).apply();
        refresh(c);
    }

    static void disconnect(Context c) {
        prefs(c).edit().clear().apply();
    }

    // ---------- New versions of this app ----------

    static final String APK_URL = "https://github.com/Carmonavirus/macro-scanner/releases/latest/download/macro-widget.apk";
    private static final String LATEST_URL = "https://api.github.com/repos/Carmonavirus/macro-scanner/releases/latest";

    /** This app's build number (the same number as the widget-vN release it came from). */
    static long installedVersion(Context c) {
        try {
            android.content.pm.PackageInfo i = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return android.os.Build.VERSION.SDK_INT >= 28 ? i.getLongVersionCode() : i.versionCode;
        } catch (Exception e) {
            return Long.MAX_VALUE;
        }
    }

    /** True when a newer Macro Widget is on GitHub than the one installed. */
    static boolean updateAvailable(Context c) {
        return prefs(c).getLong("latestVersion", 0) > installedVersion(c);
    }

    /** Look up the newest release, at most every 6 hours. Never throws. */
    static void checkForUpdate(Context c, String token, boolean force) {
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        if (!force && now - p.getLong("latestCheckedAt", 0) < 6 * 3600_000L) return;
        try {
            String tag = new JSONObject(get(LATEST_URL, token)).optString("tag_name", "");
            if (tag.startsWith("widget-v")) {
                p.edit().putLong("latestVersion", Long.parseLong(tag.substring(8)))
                    .putLong("latestCheckedAt", now).apply();
            }
        } catch (Exception ignored) { /* try again next time */ }
    }

    /** Read today's steps from Health Connect into the cache. Returns them, or -1. */
    static long readSteps(Context c) {
        long steps = Steps.today(c);
        if (steps >= 0) {
            prefs(c).edit().putString("stepsDate", LocalDate.now().toString())
                .putLong("steps", steps).putLong("stepsAt", System.currentTimeMillis()).apply();
        }
        return steps;
    }

    /** Fetch the backup and recompute today's totals. Never throws; errors are stored. */
    static synchronized void refresh(Context c) {
        SharedPreferences p = prefs(c);
        String token = p.getString("token", null);
        String gist = p.getString("gist", null);
        if (token == null || gist == null) return;
        long steps = Math.max(readSteps(c), StepCounter.today(c));
        checkForUpdate(c, token, false);
        try {
            JSONObject gistJson = new JSONObject(get("https://api.github.com/gists/" + gist, token));
            JSONObject backup = readBackup(gistJson, token);
            if (steps >= 0) {
                try { pushSteps(gistJson, token, gist, steps); } catch (Exception ignored) { /* try again next time */ }
            }
            String today = LocalDate.now().toString();
            double kcal = 0, protein = 0, carbs = 0, fat = 0;
            JSONArray log = backup.optJSONArray("log");
            if (log != null) {
                for (int i = 0; i < log.length(); i++) {
                    JSONObject e = log.optJSONObject(i);
                    if (e == null || !today.equals(e.optString("date"))) continue;
                    double f = e.optDouble("grams", 0) / 100.0;
                    JSONObject per = e.optJSONObject("per100");
                    if (per == null) continue;
                    kcal += num(per, "kcal") * f;
                    protein += num(per, "protein") * f;
                    carbs += num(per, "carbs") * f;
                    fat += num(per, "fat") * f;
                }
            }
            SharedPreferences.Editor ed = p.edit()
                .putString("date", today)
                .putFloat("kcal", (float) kcal).putFloat("protein", (float) protein)
                .putFloat("carbs", (float) carbs).putFloat("fat", (float) fat)
                .putLong("updatedAt", System.currentTimeMillis())
                .remove("error");
            ed.putFloat("gKcal", 0).putFloat("gProtein", 0).putFloat("gCarbs", 0).putFloat("gFat", 0);
            ed.remove("weight").remove("height");
            ed.remove("accent").remove("goalColor").remove("cProtein").remove("cCarbs").remove("cFat");
            JSONArray settings = backup.optJSONArray("settings");
            if (settings != null) {
                for (int i = 0; i < settings.length(); i++) {
                    JSONObject s = settings.optJSONObject(i);
                    if (s == null) continue;
                    JSONObject v = s.optJSONObject("value");
                    if (v == null) continue;
                    if ("goals".equals(s.optString("key"))) {
                        ed.putFloat("gKcal", (float) num(v, "kcal")).putFloat("gProtein", (float) num(v, "protein"))
                          .putFloat("gCarbs", (float) num(v, "carbs")).putFloat("gFat", (float) num(v, "fat"));
                    } else if ("body".equals(s.optString("key"))) {
                        ed.putFloat("weight", (float) num(v, "weight")).putFloat("height", (float) num(v, "height"));
                    } else if ("theme".equals(s.optString("key"))) {
                        putColour(ed, "accent", v.optString("accent", null));
                        putColour(ed, "goalColor", v.optString("goal", null));
                        putColour(ed, "cProtein", v.optString("protein", null));
                        putColour(ed, "cCarbs", v.optString("carbs", null));
                        putColour(ed, "cFat", v.optString("fat", null));
                    }
                }
            }
            ed.apply();
        } catch (Exception ex) {
            p.edit().putString("error", ex.getMessage() == null ? "Couldn't load your backup" : ex.getMessage()).apply();
        }
    }

    /**
     * Calories burned by walking: about 0.5 kcal per kg per km on top of resting, step length
     * about 41.5 % of height. Same formula as the web app (js/steps.js stepKcal).
     */
    static long stepKcal(long steps, double weight, double height) {
        double w = weight > 0 ? weight : 75, h = height > 0 ? height : 175;
        double km = steps * h * 0.415 / 100000.0;
        return Math.round(km * w * 0.5);
    }

    private static void putColour(SharedPreferences.Editor ed, String key, String v) {
        if (v != null && v.matches("#[0-9a-fA-F]{6}")) ed.putString(key, v);
    }

    private static double num(JSONObject o, String k) {
        double v = o.optDouble(k, 0);
        return Double.isNaN(v) || Double.isInfinite(v) ? 0 : v;
    }

    // ---------- GitHub ----------

    private static String findGist(String token) throws Exception {
        for (int page = 1; page <= 5; page++) {
            JSONArray list = new JSONArray(get("https://api.github.com/gists?per_page=100&page=" + page, token));
            for (int i = 0; i < list.length(); i++) {
                JSONObject g = list.getJSONObject(i);
                JSONObject files = g.optJSONObject("files");
                if (files != null && files.has(FILE)) return g.getString("id");
            }
            if (list.length() < 100) break;
        }
        return null;
    }

    /** Add today's steps to the steps file in the gist, if they changed. Keeps the last 400 days. */
    private static void pushSteps(JSONObject gist, String token, String gistId, long steps) throws Exception {
        String today = LocalDate.now().toString();
        JSONObject data = new JSONObject();
        JSONObject file = gist.getJSONObject("files").optJSONObject(STEPS_FILE);
        if (file != null) {
            try {
                String text = file.optBoolean("truncated", false) ? get(file.getString("raw_url"), token) : file.getString("content");
                data = new JSONObject(text);
            } catch (Exception ignored) { /* start fresh */ }
        }
        JSONObject days = data.optJSONObject("days");
        if (days == null) days = new JSONObject();
        if (days.optLong(today, -1) == steps) return;
        days.put(today, steps);
        String cutoff = LocalDate.now().minusDays(400).toString();
        java.util.List<String> old = new java.util.ArrayList<>();
        for (java.util.Iterator<String> it = days.keys(); it.hasNext(); ) { String k = it.next(); if (k.compareTo(cutoff) < 0) old.add(k); }
        for (String k : old) days.remove(k);
        data.put("days", days);
        data.put("updatedAt", java.time.Instant.now().toString());
        data.put("source", "Health Connect");
        JSONObject body = new JSONObject().put("files", new JSONObject().put(STEPS_FILE, new JSONObject().put("content", data.toString())));
        send("PATCH", "https://api.github.com/gists/" + gistId, token, body.toString());
    }

    private static JSONObject readBackup(JSONObject gist, String token) throws Exception {
        JSONObject file = gist.getJSONObject("files").optJSONObject(FILE);
        if (file == null) throw new Exception("The backup file is missing from your gist.");
        String text = file.optBoolean("truncated", false) ? get(file.getString("raw_url"), token) : file.getString("content");
        return new JSONObject(text);
    }

    private static String get(String url, String token) throws Exception {
        return send("GET", url, token, null);
    }

    private static String send(String method, String url, String token, String body) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestMethod(method); // Android's HttpURLConnection supports PATCH
        con.setConnectTimeout(8000);
        con.setReadTimeout(12000);
        con.setUseCaches(false);
        con.setRequestProperty("Accept", "application/vnd.github+json");
        con.setRequestProperty("Authorization", "Bearer " + token);
        con.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        con.setRequestProperty("Cache-Control", "no-cache");
        con.setRequestProperty("User-Agent", "MacroWidget");
        if (body != null) {
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            try (java.io.OutputStream o = con.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code;
        try {
            code = con.getResponseCode();
        } catch (java.io.IOException io) {
            throw new Exception("No internet connection");
        }
        if (code == 401) throw new Exception("GitHub didn't accept the token. It may be wrong or expired.");
        if (code == 403 || code == 404) throw new Exception("The token can't read your gists. Use a token with the gist permission.");
        if (code >= 300) throw new Exception("GitHub answered with HTTP " + code);
        try (InputStream in = con.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } finally {
            con.disconnect();
        }
    }
}
