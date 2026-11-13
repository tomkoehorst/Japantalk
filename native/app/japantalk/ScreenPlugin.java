package app.japantalk;

import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Tells the web page how much room the camera cutout takes at the top (in CSS pixels). */
@CapacitorPlugin(name = "Screen")
public class ScreenPlugin extends Plugin {

    @PluginMethod
    public void insets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            View decor = getActivity().getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
            float density = getContext().getResources().getDisplayMetrics().density;
            int top = 0;
            if (insets != null) {
                Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
                top = cut.top;
            }
            ret.put("top", Math.round(top / density));
            call.resolve(ret);
        });
    }
}
