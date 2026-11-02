package de.carmonavirus.macrowidget;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;

import java.util.List;

/**
 * Opens Macro Scanner: the installed app (Chrome's WebAPK) when it's on the phone,
 * otherwise the website in the browser. Works out which one at tap time, so it also
 * picks up the app if it's installed after the widget was added. Shows no screen.
 */
public class OpenApp extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        open(this);
        finish();
    }

    static void open(Context c) {
        Uri uri = Uri.parse(Data.APP_URL);
        Intent view = new Intent(Intent.ACTION_VIEW, uri)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String pkg = installedApp(c, view);
        if (pkg != null) {
            try {
                c.startActivity(new Intent(view).setPackage(pkg));
                return;
            } catch (ActivityNotFoundException | SecurityException ignored) {
                // fall through to the browser
            }
        }
        try {
            c.startActivity(view);
        } catch (ActivityNotFoundException ignored) {
            // no browser at all: nothing we can do
        }
    }

    /** The package of an installed web app (WebAPK) that handles the Macro Scanner URL, or null. */
    private static String installedApp(Context c, Intent view) {
        PackageManager pm = c.getPackageManager();
        List<ResolveInfo> all = pm.queryIntentActivities(view, PackageManager.MATCH_ALL);
        for (ResolveInfo r : all) {
            if (r.activityInfo == null) continue;
            String p = r.activityInfo.packageName;
            if (p != null && p.startsWith("org.chromium.webapk")) return p;
        }
        return null;
    }
}
