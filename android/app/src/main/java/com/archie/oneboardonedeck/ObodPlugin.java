package com.archie.oneboardonedeck;

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
