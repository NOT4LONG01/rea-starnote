package com.starnote.interop

import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import org.json.JSONObject
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // Back is the app's: it closes a menu or dialog, leaves the editor, goes up a notebook; only at the top it leaves the app
  override val handleBackNavigation: Boolean = false

  private var pendingBytes: ByteArray? = null
  private var web: WebView? = null
  private var authId = 0

  /** Hands a Google access token (or why there is none) back to the page: window.__gAuthDone / __gAuthFail. */
  private fun answerAuth(id: Int, token: String?, error: String?) {
    val js = if (token != null) "window.__gAuthDone && window.__gAuthDone($id, ${JSONObject.quote(token)})"
             else "window.__gAuthFail && window.__gAuthFail($id, ${JSONObject.quote(error ?: "failed")})"
    runOnUiThread { web?.evaluateJavascript(js, null) }
  }

  // Google's own consent screen (account picker, scopes), shown only when the user has not agreed yet.
  private val consent = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
    val id = authId
    try {
      val token = Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(result.data).accessToken
      if (token != null) answerAuth(id, token, null) else answerAuth(id, null, "Google returned no access token")
    } catch (e: Exception) {
      answerAuth(id, null, if (result.resultCode == RESULT_CANCELED) "cancelled" else (e.message ?: "sign-in failed"))
    }
  }

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
    /**
     * Google sign-in with the phone's account (Play Services). Google matches this app to the Android OAuth client by package
     * name and signing certificate, so there is no client ID or secret here. `interactive` = false only renews silently.
     */
    @JavascriptInterface
    fun googleAuthorize(id: Int, scopes: String, interactive: Boolean) {
      val req = AuthorizationRequest.builder().setRequestedScopes(scopes.split(" ").filter { it.isNotBlank() }.map { Scope(it) }).build()
      runOnUiThread {
        Identity.getAuthorizationClient(this@MainActivity).authorize(req)
          .addOnSuccessListener { r ->
            val pending = r.pendingIntent
            when {
              !r.hasResolution() -> answerAuth(id, r.accessToken, if (r.accessToken == null) "Google returned no access token" else null)
              !interactive || pending == null -> answerAuth(id, null, "consent needed")
              else -> { authId = id; consent.launch(IntentSenderRequest.Builder(pending.intentSender).build()) }
            }
          }
          .addOnFailureListener { e -> answerAuth(id, null, e.message ?: "sign-in failed") }
      }
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
