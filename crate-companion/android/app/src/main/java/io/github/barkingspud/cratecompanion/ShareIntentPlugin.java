package io.github.barkingspud.cratecompanion;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Text shared to Crate Companion from another app (Share, then Crate Companion), such as a
 * Discogs listing link. The app adds that listing's seller to Favorite shops.
 *
 * A share can arrive before the web app is ready, so the text waits here until the app asks
 * for it ({@code take}); one that arrives while the app is open is also sent as a "shared" event.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {
    private static String pending;
    private static ShareIntentPlugin instance;

    /** Called by MainActivity with each intent the app is opened with. */
    static void capture(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;
        pending = text.trim();
        // Handled once: a later reload shouldn't add the shop again.
        intent.setAction(Intent.ACTION_MAIN);
        if (instance != null) instance.emit();
    }

    @Override
    public void load() {
        instance = this;
    }

    private void emit() {
        if (pending == null || !hasListeners("shared")) return;
        JSObject data = new JSObject();
        data.put("text", pending);
        pending = null;
        notifyListeners("shared", data);
    }

    /** The shared text that's waiting, if any (then forgotten). */
    @PluginMethod
    public void take(PluginCall call) {
        JSObject data = new JSObject();
        data.put("text", pending);
        pending = null;
        call.resolve(data);
    }
}
