package com.starnote.interop

import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.vision.digitalink.DigitalInkRecognition
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions
import com.google.mlkit.vision.digitalink.Ink
import org.json.JSONArray
import org.json.JSONObject
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // Back is the app's: it closes a menu or dialog, leaves the editor, goes up a notebook; only at the top it leaves the app
  override val handleBackNavigation: Boolean = false

  private var pendingBytes: ByteArray? = null
  private var web: WebView? = null
  private val recognizers = HashMap<String, DigitalInkRecognizer>()

  // The system "Save as" dialog: the user picks where the file goes, so no storage permission is needed.
  private val saver = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val uri = result.data?.data
    val bytes = pendingBytes
    pendingBytes = null
    if (result.resultCode == RESULT_OK && uri != null && bytes != null) {
      try {
        contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
        Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
      } catch (e: Exception) {
        Toast.makeText(this, "Could not save: ${e.message}", Toast.LENGTH_LONG).show()
      }
    }
  }

  /** Sends a recognition result (or failure) back to the page, on the UI thread where the WebView lives. */
  private fun answerInk(id: Int, results: List<String?>?, error: String?) {
    val js = if (results != null) "window.__inkDone && window.__inkDone($id, ${JSONObject.quote(JSONArray(results).toString())})"
             else "window.__inkFail && window.__inkFail($id, ${JSONObject.quote(error ?: "failed")})"
    runOnUiThread { web?.evaluateJavascript(js, null) }
  }

  /** Recognizes lines one after the other (ML Kit answers each asynchronously). */
  private fun recognizeLines(r: DigitalInkRecognizer, lines: JSONArray, i: Int, out: MutableList<String?>, id: Int) {
    if (i >= lines.length()) { answerInk(id, out, null); return }
    val ink = Ink.builder()
    val strokes = lines.getJSONArray(i)
    for (s in 0 until strokes.length()) {
      val pts = strokes.getJSONArray(s)
      if (pts.length() == 0) continue
      val stroke = Ink.Stroke.builder()
      for (p in 0 until pts.length()) { val xy = pts.getJSONArray(p); stroke.addPoint(Ink.Point.create(xy.getDouble(0).toFloat(), xy.getDouble(1).toFloat())) }
      ink.addStroke(stroke.build())
    }
    r.recognize(ink.build())
      .addOnSuccessListener { res -> out.add(res.candidates.firstOrNull()?.text); recognizeLines(r, lines, i + 1, out, id) }
      .addOnFailureListener { out.add(null); recognizeLines(r, lines, i + 1, out, id) }
  }

  /** What the web app calls (window.StarNoteAndroid.saveFile) instead of a browser download. */
  inner class Bridge {
    /** Handwriting search: lines of ink as JSON ([[[x, y], ...], ...] per line), a language tag; answers via window.__inkDone. */
    @JavascriptInterface
    fun recognizeInk(id: Int, json: String, lang: String) {
      val tag = when (lang) { "en" -> "en-US"; else -> lang }
      val modelId = try { DigitalInkRecognitionModelIdentifier.fromLanguageTag(tag) } catch (e: Exception) { null }
      if (modelId == null) { answerInk(id, null, "unavailable: no handwriting model for $lang"); return }
      val model = DigitalInkRecognitionModel.builder(modelId).build()
      val lines = JSONArray(json)
      // the model is downloaded once (Wi-Fi or mobile data), then everything runs on the phone
      RemoteModelManager.getInstance().download(model, DownloadConditions.Builder().build())
        .addOnSuccessListener {
          val r = recognizers.getOrPut(tag) { DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build()) }
          recognizeLines(r, lines, 0, ArrayList(), id)
        }
        .addOnFailureListener { e -> answerInk(id, null, "Could not get the handwriting model: ${e.message}") }
    }

    @JavascriptInterface
    fun saveFile(name: String, mime: String, base64: String) {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      runOnUiThread {
        pendingBytes = bytes
        saver.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = mime
          putExtra(Intent.EXTRA_TITLE, name)
        })
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    web = webView
    webView.addJavascriptInterface(Bridge(), "StarNoteAndroid")
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("(window.__reaBack && window.__reaBack()) === true") { handled ->
          if (handled != "true") { // nothing left to close: the usual Back (leave the app)
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // A note app wants the whole screen: hide the status and navigation bars (a swipe from the edge shows them briefly).
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
    // adjustResize does nothing once the app draws edge to edge, so the soft keyboard's height becomes bottom padding:
    // the web view shrinks and the page and the Math panel reflow above the keyboard instead of hiding behind it.
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
      findViewById<View>(android.R.id.content).setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
      insets
    }
  }
}
