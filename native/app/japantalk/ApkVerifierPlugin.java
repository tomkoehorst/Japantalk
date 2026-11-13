package app.japantalk;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

/**
 * Checks a downloaded update before it is handed to the Android installer:
 * it must be the same app (package name), signed with the same key as the
 * installed app, and have a higher version code.
 */
@CapacitorPlugin(name = "ApkVerifier")
public class ApkVerifierPlugin extends Plugin {

    @PluginMethod
    public void verify(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Geen bestand opgegeven");
            return;
        }
        if (path.startsWith("file:")) path = Uri.parse(path).getPath();

        try {
            PackageManager pm = getContext().getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;

            PackageInfo apk = pm.getPackageArchiveInfo(path, flags);
            if (apk == null) {
                call.reject("Het gedownloade bestand is geen geldige app");
                return;
            }
            PackageInfo self = pm.getPackageInfo(getContext().getPackageName(), flags);

            Set<String> apkCerts = certs(apk);
            Set<String> selfCerts = certs(self);
            boolean samePackage = self.packageName.equals(apk.packageName);
            boolean sameKey = !apkCerts.isEmpty() && apkCerts.equals(selfCerts);
            boolean newer = versionCode(apk) > versionCode(self);

            JSObject ret = new JSObject();
            ret.put("valid", samePackage && sameKey && newer);
            ret.put("samePackage", samePackage);
            ret.put("sameKey", sameKey);
            ret.put("newer", newer);
            ret.put("packageName", apk.packageName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Controle mislukt: " + e.getMessage());
        }
    }

    private static long versionCode(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static Set<String> certs(PackageInfo pi) throws Exception {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null) {
            sigs = pi.signingInfo.hasMultipleSigners()
                ? pi.signingInfo.getApkContentsSigners()
                : pi.signingInfo.getSigningCertificateHistory();
        } else {
            sigs = pi.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            byte[] d = md.digest(s.toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            out.add(sb.toString());
        }
        return out;
    }
}
