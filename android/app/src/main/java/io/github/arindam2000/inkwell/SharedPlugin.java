package io.github.arindam2000.inkwell;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.io.InputStream;

/** Files in and out of Inkwell through Android's Share menu: receive a photo/PDF, or save/send Inkwell's result. */
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

    /** Hand files to Android's Share menu, so they can be saved to Drive or Files, or sent. files: [{name, type, data base64}] */
    @PluginMethod
    public void send(PluginCall call) {
        try {
            JSArray files = call.getArray("files");
            ArrayList<Uri> uris = new ArrayList<>();
            String type = "*/*";
            File dir = new File(getContext().getCacheDir(), "out");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            for (int i = 0; i < files.length(); i++) {
                org.json.JSONObject f = files.getJSONObject(i);
                File out = new File(dir, f.getString("name").replaceAll("[^A-Za-z0-9._-]", "_"));
                try (FileOutputStream o = new FileOutputStream(out)) { o.write(Base64.decode(f.getString("data"), Base64.DEFAULT)); }
                uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out));
                type = f.getString("type");
            }
            Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
            send.setType(type);
            if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, "Save or send"));
            call.resolve();
        } catch (Exception e) {
            call.reject("Can't share the file");
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
