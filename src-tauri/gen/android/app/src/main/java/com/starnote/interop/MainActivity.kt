package com.starnote.interop

import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var pendingBytes: ByteArray? = null

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

  /** What the web app calls (window.StarNoteAndroid.saveFile) instead of a browser download. */
  inner class Bridge {
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
    webView.addJavascriptInterface(Bridge(), "StarNoteAndroid")
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
