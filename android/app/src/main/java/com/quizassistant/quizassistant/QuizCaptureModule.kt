package com.quizassistant.quizassistant

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * React Native bridge: screen capture (MediaProjection) + ML Kit OCR.
 *
 * JS contract (see src/services/realScan.ts):
 * - hasConsent(): Promise<boolean>
 * - requestConsent(): Promise<boolean>   // launches system consent dialog
 * - getScreenSize(): Promise<{width,height}> (pixels)
 * - capture(regionJson?): Promise<{uri,width,height}>
 * - recognize(imagePath): Promise<string>
 * - captureAndOcr(regionJson?): Promise<{uri,width,height,text}>
 *
 * regionJson: '{"x":0,"y":100,"width":800,"height":200}' in screenshot pixels,
 * or null/undefined for full screen.
 */
class QuizCaptureModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  com.facebook.react.bridge.ActivityEventListener {

  companion object {
    const val NAME = "QuizCapture"
    private const val REQ_CAPTURE_CONSENT = 0xCAFE

    @Volatile var consentResultCode: Int = -1
    @Volatile var consentData: Intent? = null
  }

  private var consentPromise: Promise? = null
  private val io = Executors.newCachedThreadPool()

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  private fun parseRegion(s: String?): IntArray? {
    if (s.isNullOrBlank()) return null
    val o = JSONObject(s)
    return intArrayOf(o.getInt("x"), o.getInt("y"), o.getInt("width"), o.getInt("height"))
  }

  @ReactMethod
  fun hasConsent(p: Promise) {
    p.resolve(consentData != null)
  }

  @ReactMethod
  fun requestConsent(p: Promise) {
    val activity = currentActivity
    if (activity == null) {
      p.reject("E_NO_ACTIVITY", "No foreground activity")
      return
    }
    if (consentPromise != null) {
      p.reject("E_BUSY", "Consent request already pending")
      return
    }
    try {
      val mpm = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      consentPromise = p
      activity.startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE_CONSENT)
    } catch (e: Exception) {
      consentPromise = null
      p.reject("E_INTENT", e.message)
    }
  }

  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_CAPTURE_CONSENT) return
    val p = consentPromise
    consentPromise = null
    if (resultCode == Activity.RESULT_OK && data != null) {
      consentResultCode = resultCode
      consentData = data
      p?.resolve(true)
    } else {
      p?.resolve(false)
    }
  }

  override fun onNewIntent(intent: Intent?) {}

  @ReactMethod
  fun getScreenSize(p: Promise) {
    try {
      val wm = reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val (w, h) = if (Build.VERSION.SDK_INT >= 30) {
        val b = wm.currentWindowMetrics.bounds
        Pair(b.width(), b.height())
      } else {
        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getMetrics(m)
        Pair(m.widthPixels, m.heightPixels)
      }
      val map = Arguments.createMap()
      map.putInt("width", w)
      map.putInt("height", h)
      p.resolve(map)
    } catch (e: Exception) {
      p.reject("E_SIZE", e.message)
    }
  }

  private fun doCaptureSync(region: IntArray?): QuizCaptureService.ShotResult.Ok {
    val data = consentData ?: throw IllegalStateException("Screen capture consent not granted")
    val latch = CountDownLatch(1)
    QuizCaptureService.pendingLatch = latch
    QuizCaptureService.pendingResult.set(null)
    val intent = Intent(reactContext, QuizCaptureService::class.java).apply {
      action = QuizCaptureService.ACTION_CAPTURE
      putExtra(QuizCaptureService.EXTRA_RESULT_CODE, consentResultCode)
      putExtra(QuizCaptureService.EXTRA_DATA, data)
      if (region != null) putExtra(QuizCaptureService.EXTRA_REGION, region)
    }
    if (Build.VERSION.SDK_INT >= 26) {
      reactContext.startForegroundService(intent)
    } else {
      reactContext.startService(intent)
    }
    try {
      val done = latch.await(20, TimeUnit.SECONDS)
      if (!done) throw IllegalStateException("Capture timed out")
      return when (val r = QuizCaptureService.pendingResult.getAndSet(null)) {
        is QuizCaptureService.ShotResult.Ok -> r
        is QuizCaptureService.ShotResult.Err -> throw IllegalStateException(r.message)
        null -> throw IllegalStateException("No capture result")
      }
    } finally {
      QuizCaptureService.pendingLatch = null
    }
  }

  @ReactMethod
  fun capture(regionJson: String?, p: Promise) {
    io.execute {
      try {
        val region = try {
          parseRegion(regionJson)
        } catch (e: Exception) {
          p.reject("E_REGION", "Bad region: ${e.message}")
          return@execute
        }
        val r = doCaptureSync(region)
        val map = Arguments.createMap()
        map.putString("uri", r.path)
        map.putInt("width", r.width)
        map.putInt("height", r.height)
        p.resolve(map)
      } catch (e: Exception) {
        p.reject(if (e.message == "Screen capture consent not granted") "E_NO_CONSENT" else "E_CAPTURE", e.message)
      }
    }
  }

  @ReactMethod
  fun recognize(imagePath: String, p: Promise) {
    io.execute {
      try {
        p.resolve(QuizOcrHelper.recognize(reactContext, imagePath))
      } catch (e: Exception) {
        p.reject("E_OCR", e.message)
      }
    }
  }

  @ReactMethod
  fun captureAndOcr(regionJson: String?, p: Promise) {
    io.execute {
      try {
        val region = try {
          parseRegion(regionJson)
        } catch (e: Exception) {
          p.reject("E_REGION", "Bad region: ${e.message}")
          return@execute
        }
        val shot = doCaptureSync(region)
        val text = try {
          QuizOcrHelper.recognize(reactContext, shot.path)
        } catch (e: Exception) {
          p.reject("E_OCR", e.message)
          return@execute
        }
        val map = Arguments.createMap()
        map.putString("uri", shot.path)
        map.putInt("width", shot.width)
        map.putInt("height", shot.height)
        map.putString("text", text)
        p.resolve(map)
      } catch (e: Exception) {
        p.reject(if (e.message == "Screen capture consent not granted") "E_NO_CONSENT" else "E_CAPTURE", e.message)
      }
    }
  }
}
