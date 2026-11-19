package com.archie.oneboardonedeck;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * App 外殼：遊戲本身是網頁（WebView），這裡只做手機端才做得到的事。
 * - 全螢幕：藏起狀態列、導覽列（從邊緣滑一下會暫時出現）。
 * - 返回鍵／返回手勢：交給遊戲（跟網頁版按 Esc 一樣）；遊戲說沒東西可退（主畫面）才交給系統關掉 App。
 * - 切到別的 App、關螢幕：通知遊戲自動暫停並存進度；回來時通知遊戲重連連線房間。
 * - 保持螢幕恆亮、鏡頭範圍：遊戲透過 ObodPlugin 來要。
 */
public class MainActivity extends BridgeActivity {
    private OnBackPressedCallback backCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ObodPlugin.class);
        super.onCreate(savedInstanceState);
        // 預設恆亮；遊戲開好後照設定再調整
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge() != null ? getBridge().getWebView() : null;
                if (w == null) {
                    fallBack();
                    return;
                }
                w.evaluateJavascript(
                    "(function(){try{return window.__obodBack?window.__obodBack():false;}catch(e){return false;}})()",
                    value -> {
                        if (!"true".equals(value)) fallBack();
                    });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
    }

    private void fallBack() {
        backCallback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
    }

    @Override
    public void onResume() {
        super.onResume();
        // 系統有時按了返回後還留著這個畫面：回來時把返回鍵的處理再打開
        if (backCallback != null) backCallback.setEnabled(true);
        hideSystemBars();
        // 從背景回來：連線房間馬上重連
        WebView w = getBridge() != null ? getBridge().getWebView() : null;
        if (w != null) w.evaluateJavascript("window.__obodResume&&window.__obodResume()", null);
    }

    @Override
    public void onPause() {
        // 切到別的 App、關螢幕：遊戲自動暫停並存一份進度（跟網頁版切走分頁一樣）
        WebView w = getBridge() != null ? getBridge().getWebView() : null;
        if (w != null) w.evaluateJavascript("window.__obodPause&&window.__obodPause()", null);
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
