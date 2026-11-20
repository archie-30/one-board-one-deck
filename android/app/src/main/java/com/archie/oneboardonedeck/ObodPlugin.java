package com.archie.oneboardonedeck;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 給遊戲（網頁，src/core/native.ts）呼叫的手機端功能 */
@CapacitorPlugin(name = "Obod")
public class ObodPlugin extends Plugin {
    /** 保持螢幕恆亮（設定開關）：{ on: true/false } */
    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /**
     * 震動反饋（設定可關）：{ pattern: [震, 停, 震, …]（毫秒）, amp: 1～255 強度 }。
     * 手機能調強度的就照 amp；不能調的只照長短。
     */
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void vibrate(PluginCall call) {
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) {
                call.resolve();
                return;
            }
            com.getcapacitor.JSArray arr = call.getArray("pattern");
            int amp = Math.max(1, Math.min(255, call.getInt("amp", 128)));
            int n = arr != null ? arr.length() : 0;
            if (n == 0) {
                call.resolve();
                return;
            }
            long[] timings = new long[n + 1];
            int[] amps = new int[n + 1];
            timings[0] = 0;
            for (int i = 0; i < n; i++) {
                timings[i + 1] = Math.max(1, arr.getLong(i));
                // 單數位置是「震」、雙數位置是「停」
                amps[i + 1] = i % 2 == 0 ? amp : 0;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(timings, amps, -1));
            } else {
                v.vibrate(timings, -1);
            }
        } catch (Exception ignored) {
            // 震不了就算了，不影響遊戲
        }
        call.resolve();
    }

    /** 瀏海／挖孔鏡頭的範圍，換成網頁的 CSS 像素：{ t, r, b, l } */
    @PluginMethod
    public void cutout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            float d = getActivity().getResources().getDisplayMetrics().density;
            WindowInsetsCompat w = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            Insets i = w != null ? w.getInsets(WindowInsetsCompat.Type.displayCutout()) : Insets.NONE;
            JSObject r = new JSObject();
            r.put("t", Math.round(i.top / d));
            r.put("r", Math.round(i.right / d));
            r.put("b", Math.round(i.bottom / d));
            r.put("l", Math.round(i.left / d));
            call.resolve(r);
        });
    }
}
