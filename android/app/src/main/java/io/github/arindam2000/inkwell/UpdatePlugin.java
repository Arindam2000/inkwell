package io.github.arindam2000.inkwell;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates without Chrome: the new app downloads into Inkwell's own cache folder, then Android's
 * installer opens on it. The file is deleted the next time Inkwell starts (after the install, or a cancel).
 */
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {

    private File dir() { return new File(getContext().getCacheDir(), "update"); }

    /** Remove a downloaded update; called when the app starts. */
    @PluginMethod
    public void cleanup(PluginCall call) {
        File[] files = dir().listFiles();
        if (files != null) for (File f : files) //noinspection ResultOfMethodCallIgnored
            f.delete();
        call.resolve();
    }

    /** Download {url} with "progress" events {pct}, then open the installer. Resolves {needsPermission} when Android must allow Inkwell to install apps first. */
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://github.com/Arindam2000/inkwell/")) { call.reject("Bad update link"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // One time only: Android's "Install unknown apps" switch for Inkwell.
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(allow);
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }
        new Thread(() -> {
            try {
                File d = dir();
                //noinspection ResultOfMethodCallIgnored
                d.mkdirs();
                File apk = new File(d, "inkwell.apk");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true); // GitHub sends the file from another https address
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                long total = c.getContentLengthLong(), got = 0;
                int last = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : -1;
                        if (pct != last) {
                            last = pct;
                            JSObject p = new JSObject();
                            p.put("pct", pct);
                            notifyListeners("progress", p);
                        }
                    }
                } finally {
                    c.disconnect();
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent open = new Intent(Intent.ACTION_VIEW);
                open.setDataAndType(uri, "application/vnd.android.package-archive");
                open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(open);
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject("Download failed");
            }
        }).start();
    }
}
