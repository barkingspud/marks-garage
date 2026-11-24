package io.github.barkingspud.cratecompanion;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Text is allowed to grow this far with the phone's font size (beyond it, layouts crowd). */
    private static final int MAX_TEXT_ZOOM = 150;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);
        super.onCreate(savedInstanceState);
        followSystemFontSize();
        ShareIntentPlugin.capture(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ShareIntentPlugin.capture(intent);
    }

    /**
     * Android's Font size setting (Settings, Display) applies to native apps but not to web
     * content unless the app passes it on. Changing it restarts the activity, so this runs again.
     */
    private void followSystemFontSize() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        float scale = getResources().getConfiguration().fontScale;
        int zoom = Math.round(scale * 100);
        zoom = Math.max(85, Math.min(MAX_TEXT_ZOOM, zoom));
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setTextZoom(zoom);
    }
}
