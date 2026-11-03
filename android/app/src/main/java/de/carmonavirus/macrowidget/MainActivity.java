package de.carmonavirus.macrowidget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** One screen: connect to the cloud backup, then add the widget. */
public class MainActivity extends Activity {
    private static final String TOKEN_URL =
        "https://github.com/settings/tokens/new?scopes=gist&description=Macro%20Widget";

    private LinearLayout box;
    private static final int ASK_STEPS = 7;
    private boolean askedSteps;

    @Override
    protected void onResume() {
        super.onResume();
        // Health Connect lets apps read while they're on screen, so update steps now.
        if (Data.connected(this) && Steps.allowed(this)) refreshThenRender();
    }

    private void refreshThenRender() {
        new Thread(() -> {
            Data.refresh(getApplicationContext());
            MacroWidget.drawAll(getApplicationContext());
            runOnUiThread(this::render);
        }).start();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code != ASK_STEPS) return;
        askedSteps = true;
        if (Steps.allowed(this)) refreshThenRender(); else render();
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        box.setPadding(pad, pad + dp(24), pad, pad);
        scroll.addView(box);
        setContentView(scroll);
        render();
    }

    private void render() {
        box.removeAllViews();
        title("Macro Widget");
        if (!Data.connected(this)) {
            text("Shows today’s calories and macros from Macro Scanner on your home screen.\n\n"
                + "It reads them from your Macro Scanner cloud backup, so turn that on in the app first "
                + "(More › Automatic cloud backup).\n\n"
                + "Then paste a GitHub token with the gist permission. You can paste the same token as in the app, "
                + "or make a new one:");
            Button make = button("Create a token on GitHub");
            make.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(TOKEN_URL))));
            EditText token = new EditText(this);
            token.setHint("ghp_…");
            token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
            token.setSingleLine(true);
            box.addView(token, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            TextView err = text("");
            Button connect = button("Connect");
            connect.setOnClickListener(v -> {
                String t = token.getText().toString().trim();
                if (t.isEmpty()) { err.setText("Paste the token first."); return; }
                connect.setEnabled(false);
                connect.setText("Connecting…");
                new Thread(() -> {
                    String msg = null;
                    try { Data.connect(getApplicationContext(), t); } catch (Exception e) { msg = e.getMessage(); }
                    final String m = msg;
                    runOnUiThread(() -> {
                        if (m == null) {
                            MacroWidget.drawAll(this);
                            RefreshJob.schedule(this);
                            render();
                        } else {
                            err.setText(m);
                            connect.setEnabled(true);
                            connect.setText("Connect");
                        }
                    });
                }).start();
            });
            return;
        }

        Data.Today t = Data.cached(this);
        text(t.error != null ? "Last update failed: " + t.error
            : "Connected. Today so far: " + Math.round(t.kcal) + " kcal · P " + MacroWidget.fmt(t.protein)
              + " g · C " + MacroWidget.fmt(t.carbs) + " g · F " + MacroWidget.fmt(t.fat) + " g");
        stepsSection(t);
        text("Add the widget: long-press an empty spot on your home screen, tap Widgets, find Macro Widget "
            + "and drag “Today’s macros” onto the screen.\n\n"
            + "It updates about every 15 minutes. Tap the arrows on the widget to update right away. "
            + "Tapping the widget opens Macro Scanner.");
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager m = getSystemService(AppWidgetManager.class);
            if (m != null && m.isRequestPinAppWidgetSupported()) {
                Button pin = button("Add widget to home screen");
                pin.setOnClickListener(v -> m.requestPinAppWidget(new ComponentName(this, MacroWidget.class), null, null));
            }
        }
        Button now = button("Update now");
        now.setOnClickListener(v -> {
            now.setEnabled(false);
            new Thread(() -> {
                Data.refresh(getApplicationContext());
                MacroWidget.drawAll(getApplicationContext());
                runOnUiThread(this::render);
            }).start();
        });
        Button open = button("Open Macro Scanner");
        open.setOnClickListener(v -> OpenApp.open(this));
        Button off = button("Disconnect");
        off.setOnClickListener(v -> {
            Data.disconnect(this);
            MacroWidget.drawAll(this);
            render();
        });
    }

    private void stepsSection(Data.Today t) {
        TextView h = text("Steps");
        h.setTypeface(h.getTypeface(), android.graphics.Typeface.BOLD);
        if (!Steps.supported()) {
            text("Showing steps needs Android 14 or newer, where Health Connect is built in.");
            return;
        }
        if (Steps.allowed(this)) {
            text(t.steps >= 0
                ? "Today: " + String.format(java.util.Locale.getDefault(), "%,d", t.steps) + " steps, from Health Connect. "
                    + "They show on the widget and in Macro Scanner's diary."
                : "Allowed. Steps appear after the next update.");
            if (t.steps == 0) {
                text("Health Connect has no steps for today yet. That usually means no app on this phone is "
                    + "writing steps into Health Connect. Open Health Connect › App permissions, pick your step app "
                    + "(e.g. StepsApp, Google Fit or Samsung Health) and allow it to write Steps, or turn on "
                    + "Health Connect sync in that app's settings.");
            }
            Button hcOpen = button("Open Health Connect");
            hcOpen.setOnClickListener(v -> openHealthConnect());
            if (Build.VERSION.SDK_INT < 35) {
                text("On Android 14 steps can only be read while this app is open, so the widget's step count updates "
                    + "when you open Macro Widget.");
            }
            return;
        }
        text("Show today’s steps on the widget and in Macro Scanner. Health Connect adds up the steps from your phone, "
            + "watch and fitness apps. They are only saved in your own private GitHub gist, next to your backup.");
        Button allow = button("Show my steps");
        allow.setOnClickListener(v -> requestPermissions(Steps.permissions(), ASK_STEPS));
        if (askedSteps) {
            text("Nothing changed? Allow “Steps” for Macro Widget in Health Connect:");
            Button hc = button("Open Health Connect");
            hc.setOnClickListener(v -> openHealthConnect());
        }
    }

    private void openHealthConnect() {
        try {
            startActivity(new Intent("android.health.connect.action.HEALTH_HOME_SETTINGS"));
        } catch (Exception e) {
            try {
                startActivity(new Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS")
                    .putExtra(Intent.EXTRA_PACKAGE_NAME, getPackageName()));
            } catch (Exception ignored) { /* none */ }
        }
    }

    private TextView title(String s) {
        TextView v = text(s);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        v.setTypeface(v.getTypeface(), android.graphics.Typeface.BOLD);
        return v;
    }

    private TextView text(String s) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        v.setPadding(0, dp(6), 0, dp(10));
        box.addView(v);
        return v;
    }

    private Button button(String s) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(6);
        box.addView(b, lp);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
