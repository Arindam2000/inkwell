package io.github.arindam2000.inkwell;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** A photo or PDF shared to Inkwell from Drive, WhatsApp or Files (Android's Share menu). */
@CapacitorPlugin(name = "Shared")
public class SharedPlugin extends Plugin {

    /** The shared file, once; {} if nothing was shared. */
    @PluginMethod
    public void take(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject ret = new JSObject();
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) { call.resolve(ret); return; }
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        intent.setAction(Intent.ACTION_MAIN); // take it only once
        if (uri == null) { call.resolve(ret); return; }
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            ret.put("name", name(uri));
            ret.put("type", getContext().getContentResolver().getType(uri));
            ret.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Can't open the shared file");
        }
    }

    /** App already open: a new share arrives here; tell the page to take it. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            getActivity().setIntent(intent);
            notifyListeners("shared", new JSObject());
        }
    }

    private String name(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) {}
        return "shared";
    }
}
