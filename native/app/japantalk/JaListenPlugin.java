package app.japantalk;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * More forgiving speech recognition for short Japanese phrases.
 * - tells the page when the microphone is really ready ("ready") and how loud you are ("rms")
 * - keeps listening (restarts) if you start talking late, up to maxWaitMs
 * - longer silence before it decides you are done
 * - if the final result is empty, uses what it recognised along the way (partial results)
 * - retries when the recogniser is busy or fails right away
 */
@CapacitorPlugin(name = "JaListen")
public class JaListenPlugin extends Plugin {

    private SpeechRecognizer rec;
    private PluginCall cur;
    private ArrayList<String> partial = new ArrayList<>();
    private boolean heardSpeech, stopRequested;
    private int retries;
    private long deadline, lastRms;
    private String lang = "ja-JP";
    private int maxResults = 5;
    private final Handler h = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void start(PluginCall call) {
        lang = call.getString("language", "ja-JP");
        maxResults = call.getInt("maxResults", 5);
        int maxWait = call.getInt("maxWaitMs", 8000);
        getActivity().runOnUiThread(() -> {
            finish(new ArrayList<>(), "replaced");
            cur = call;
            partial = new ArrayList<>();
            heardSpeech = false;
            stopRequested = false;
            retries = 0;
            deadline = SystemClock.elapsedRealtime() + maxWait;
            begin();
            h.postDelayed(() -> { if (cur == call && rec != null) rec.stopListening(); }, maxWait + 6000L);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopRequested = true;
            if (rec != null) { try { rec.stopListening(); } catch (Exception e) { finish(partial, null); } }
            else finish(partial, null);
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> { finish(new ArrayList<>(), "cancelled"); call.resolve(); });
    }

    private void begin() {
        destroyRec();
        try {
            rec = SpeechRecognizer.createSpeechRecognizer(getContext());
            rec.setRecognitionListener(new Listener());
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, maxResults);
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L);
            rec.startListening(i);
        } catch (Exception e) {
            finish(new ArrayList<>(), e.getMessage());
        }
    }

    private void destroyRec() {
        if (rec != null) {
            try { rec.cancel(); } catch (Exception ignored) {}
            try { rec.destroy(); } catch (Exception ignored) {}
            rec = null;
        }
    }

    private void emit(String state, float value, String text) {
        JSObject o = new JSObject();
        o.put("state", state);
        o.put("value", value);
        if (text != null) o.put("text", text);
        notifyListeners("jaListen", o);
    }

    private static boolean hasText(ArrayList<String> l) {
        if (l == null) return false;
        for (String s : l) if (s != null && !s.trim().isEmpty()) return true;
        return false;
    }

    private void finish(ArrayList<String> matches, String error) {
        if (cur == null) return;
        PluginCall c = cur;
        cur = null;
        destroyRec();
        JSObject r = new JSObject();
        JSArray a = new JSArray();
        if (matches != null) for (String s : matches) if (s != null && !s.trim().isEmpty()) a.put(s);
        r.put("matches", a);
        r.put("heard", heardSpeech);
        if (error != null) r.put("error", error);
        c.resolve(r);
        emit("done", 0, null);
    }

    private class Listener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) { emit("ready", 0, null); }
        @Override public void onBeginningOfSpeech() { heardSpeech = true; emit("speech", 0, null); }
        @Override public void onRmsChanged(float rms) {
            long now = SystemClock.elapsedRealtime();
            if (now - lastRms > 90) { lastRms = now; emit("rms", rms, null); }
        }
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() { emit("end", 0, null); }
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override public void onPartialResults(Bundle b) {
            ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (hasText(l)) { partial = l; emit("partial", 0, l.get(0)); }
        }

        @Override public void onResults(Bundle b) {
            ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            finish(hasText(l) ? l : partial, null);
        }

        @Override public void onError(int error) {
            if (cur == null) return;
            if (hasText(partial)) { finish(partial, null); return; }
            long now = SystemClock.elapsedRealtime();
            boolean nothingYet = (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) && !heardSpeech;
            boolean hiccup = error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT
                || error == SpeechRecognizer.ERROR_AUDIO || error == 11 /* server disconnected */;
            if (!stopRequested && now < deadline && (nothingYet || (hiccup && retries < 4))) {
                retries++;
                PluginCall c = cur;
                h.postDelayed(() -> { if (cur == c) begin(); }, hiccup ? 450 : 150);
                return;
            }
            finish(new ArrayList<>(), "error " + error);
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyRec();
    }
}
