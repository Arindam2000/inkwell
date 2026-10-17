package io.github.arindam2000.inkwell;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Talks to printers on the home Wi-Fi (Chrome can't): finds them, and sends a print job.
 * The job is built in a temp file piece by piece (begin, append..., finish), so big jobs never sit in memory.
 */
@CapacitorPlugin(name = "Ipp")
public class IppPlugin extends Plugin {

    /** Look for IPP printers for 4 seconds. Returns [{name, host, port}]. */
    @PluginMethod
    public void discover(PluginCall call) {
        NsdManager nsd = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
        Map<String, JSObject> found = new LinkedHashMap<>();
        ArrayDeque<NsdServiceInfo> toResolve = new ArrayDeque<>();
        boolean[] resolving = {false};

        Runnable[] next = new Runnable[1];
        next[0] = () -> {
            synchronized (toResolve) {
                if (resolving[0] || toResolve.isEmpty()) return;
                resolving[0] = true;
                // Android resolves one service at a time.
                nsd.resolveService(toResolve.poll(), new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo s, int err) { done(); }
                    @Override public void onServiceResolved(NsdServiceInfo s) {
                        if (s.getHost() != null) {
                            JSObject p = new JSObject();
                            p.put("name", s.getServiceName());
                            p.put("host", s.getHost().getHostAddress());
                            p.put("port", s.getPort());
                            synchronized (found) { found.put(s.getServiceName(), p); }
                        }
                        done();
                    }
                    void done() { synchronized (toResolve) { resolving[0] = false; } next[0].run(); }
                });
            }
        };

        NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
            @Override public void onServiceFound(NsdServiceInfo s) { synchronized (toResolve) { toResolve.add(s); } next[0].run(); }
            @Override public void onStartDiscoveryFailed(String t, int e) {}
            @Override public void onStopDiscoveryFailed(String t, int e) {}
            @Override public void onDiscoveryStarted(String t) {}
            @Override public void onDiscoveryStopped(String t) {}
            @Override public void onServiceLost(NsdServiceInfo s) {}
        };
        nsd.discoverServices("_ipp._tcp", NsdManager.PROTOCOL_DNS_SD, listener);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            try { nsd.stopServiceDiscovery(listener); } catch (Exception ignored) {}
            JSArray list = new JSArray();
            synchronized (found) { for (JSObject p : found.values()) list.put(p); }
            JSObject ret = new JSObject();
            ret.put("printers", list);
            call.resolve(ret);
        }, 4000);
    }

    @PluginMethod
    public void begin(PluginCall call) {
        String id = UUID.randomUUID().toString();
        try {
            if (!job(id).createNewFile()) throw new Exception("exists");
        } catch (Exception e) { call.reject("Can't start the job"); return; }
        JSObject ret = new JSObject();
        ret.put("id", id);
        call.resolve(ret);
    }

    @PluginMethod
    public void append(PluginCall call) {
        try (OutputStream out = new FileOutputStream(job(call.getString("id")), true)) {
            out.write(Base64.decode(call.getString("data"), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) { call.reject("Can't build the job"); }
    }

    /** POST the job file to the printer and return its IPP reply (base64). */
    @PluginMethod
    public void finish(PluginCall call) {
        File f = job(call.getString("id"));
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(call.getString("url")).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(180000);
            c.setDoOutput(true);
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/ipp");
            c.setFixedLengthStreamingMode(f.length());
            byte[] buf = new byte[65536];
            try (InputStream in = new FileInputStream(f); OutputStream out = c.getOutputStream()) {
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            }
            ByteArrayOutputStream reply = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                for (int n; (n = in.read(buf)) > 0; ) reply.write(buf, 0, n);
            }
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(reply.toByteArray(), Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Can't reach the printer");
        } finally {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private File job(String id) {
        return new File(getContext().getCacheDir(), "ipp-" + id.replaceAll("[^a-z0-9-]", "") + ".job");
    }

    /** Any printer: Android's own print screen with this PDF (uses the phone's print services: Mopria, HP, USB…). */
    @PluginMethod
    public void systemPrint(PluginCall call) {
        final byte[] pdf = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
        final String name = call.getString("name", "Inkwell");
        getActivity().runOnUiThread(() -> {
            PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            pm.print(name, new PrintDocumentAdapter() {
                @Override
                public void onLayout(PrintAttributes oldA, PrintAttributes newA, CancellationSignal cancel, LayoutResultCallback cb, Bundle extras) {
                    if (cancel.isCanceled()) { cb.onLayoutCancelled(); return; }
                    cb.onLayoutFinished(new PrintDocumentInfo.Builder(name + ".pdf").setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
                }
                @Override
                public void onWrite(PageRange[] range, ParcelFileDescriptor dest, CancellationSignal cancel, WriteResultCallback cb) {
                    try (FileOutputStream out = new FileOutputStream(dest.getFileDescriptor())) {
                        out.write(pdf);
                        cb.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                    } catch (Exception e) {
                        cb.onWriteFailed(e.getMessage());
                    }
                }
            }, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            call.resolve();
        });
    }

    /** Open Android's Printing settings (some phones ship with the Default Print Service switched off). */
    @PluginMethod
    public void openPrintSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_PRINT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }
}