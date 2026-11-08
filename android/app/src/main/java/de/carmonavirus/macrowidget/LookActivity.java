package de.carmonavirus.macrowidget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

/**
 * Customize the widget: text size, background, light or dark, eaten or left, which parts show.
 * Opens from the app and when you long-press the widget and pick its settings (Android 12+).
 */
public class LookActivity extends Activity {
    private LinearLayout box;
    private FrameLayout preview;
    private Look look;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // Opened by the home screen for one widget: placing or keeping it is always fine.
        int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        }
        look = Look.load(this);

        ScrollView scroll = new ScrollView(this);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        box.setPadding(pad, pad + dp(24), pad, pad);
        scroll.addView(box);
        setContentView(scroll);
        render();
    }

    @Override
    protected void onPause() {
        super.onPause();
        MacroWidget.drawAll(this);
    }

    private void render() {
        box.removeAllViews();
        TextView title = text("Customize widget");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);

        // Live preview of the widget with these settings
        preview = new FrameLayout(this);
        preview.setPadding(dp(8), dp(8), dp(8), dp(8));
        preview.setBackgroundColor(0xFF6B7F99);   // like a wallpaper, so see-through shows
        box.addView(preview, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        drawPreview();

        heading("Text size");
        slider(80, 160, 5, look.textSize, "%d %%", v -> look.textSize = v);

        heading("Background");
        slider(0, 100, 5, look.opacity, "%d %% solid", v -> look.opacity = v);

        heading("Colours");
        choice(new String[] { "Like the phone", "Light", "Dark" }, look.theme, i -> look.theme = i);

        heading("Big numbers show");
        choice(new String[] { "What I ate", "What’s left" }, look.showLeft ? 1 : 0, i -> look.showLeft = i == 1);

        heading("Show on the widget");
        check("Calorie bar", look.showBar, b -> look.showBar = b);
        check("Protein, carbs and fat", look.showTiles, b -> look.showTiles = b);
        check("Steps and calories burned", look.showSteps, b -> look.showSteps = b);
        check("“Updated” time", look.showStatus, b -> look.showStatus = b);
        check("Refresh button", look.showRefresh, b -> look.showRefresh = b);

        heading("Lock screen");
        check("Show my steps on the lock screen", look.lockSteps, b -> {
            look.lockSteps = b;
            look.save(this);
            StepService.refresh(this);
        });
        check("Hide them while music is playing", look.lockHideMusic, b -> {
            look.lockHideMusic = b;
            look.save(this);
            StepService.refresh(this);
        });
        text(StepCounter.enabled(this)
            ? "Shows today’s steps in the step counter notification on your lock screen. While any app plays music, they step aside for the cover art and come back when it stops."
            : "Works while Macro Widget counts your steps. Turn on “Count my steps” in the app first.").setAlpha(0.7f);

        Button reset = new Button(this);
        reset.setText("Back to normal");
        reset.setAllCaps(false);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(16);
        box.addView(reset, lp);
        reset.setOnClickListener(v -> {
            Look.reset(this);
            look = Look.load(this);
            MacroWidget.drawAll(this);
            StepService.refresh(this);
            render();
        });
        text("Changes show on your home screen right away.").setAlpha(0.7f);
    }

    private void changed() {
        look.save(this);
        drawPreview();
    }

    private void drawPreview() {
        preview.removeAllViews();
        try {
            View w = MacroWidget.build(this).apply(this, preview);
            w.setClickable(false);
            preview.addView(w, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        } catch (Exception e) {
            TextView t = new TextView(this);
            t.setText("Preview not available on this phone. Check the widget on your home screen.");
            preview.addView(t);
        }
    }

    // ---------- small UI helpers ----------

    interface IntSet { void set(int v); }
    interface BoolSet { void set(boolean v); }

    private void slider(int min, int max, int step, int value, String label, IntSet set) {
        TextView shown = text(String.format(label, value));
        shown.setPadding(0, 0, 0, 0);
        SeekBar bar = new SeekBar(this);
        bar.setMax((max - min) / step);
        bar.setProgress((value - min) / step);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) {
                int v = min + p * step;
                shown.setText(String.format(label, v));
                set.set(v);
                changed();
            }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { MacroWidget.drawAll(LookActivity.this); }
        });
        box.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private void choice(String[] labels, int selected, IntSet set) {
        RadioGroup g = new RadioGroup(this);
        g.setOrientation(RadioGroup.HORIZONTAL);
        for (int i = 0; i < labels.length; i++) {
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId());
            r.setText(labels[i]);
            r.setPadding(0, 0, dp(12), 0);
            g.addView(r);
            if (i == selected) r.setChecked(true);
            final int index = i;
            r.setOnCheckedChangeListener((b, on) -> {
                if (!on) return;
                set.set(index);
                changed();
                MacroWidget.drawAll(this);
            });
        }
        box.addView(g);
    }

    private void check(String label, boolean on, BoolSet set) {
        CheckBox b = new CheckBox(this);
        b.setText(label);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setChecked(on);
        b.setOnCheckedChangeListener((x, v) -> {
            set.set(v);
            changed();
            MacroWidget.drawAll(this);
        });
        box.addView(b);
    }

    private void heading(String s) {
        TextView h = text(s);
        h.setTypeface(h.getTypeface(), android.graphics.Typeface.BOLD);
        h.setPadding(0, dp(14), 0, dp(2));
    }

    private TextView text(String s) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        v.setPadding(0, dp(6), 0, dp(10));
        box.addView(v);
        return v;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
