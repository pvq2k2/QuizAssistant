package com.quizassistant.quizassistant

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * React Native bridge: screen capture (MediaProjection) + ML Kit OCR +
 * assistant sync + overlay/bubble/accessibility controls.
 *
 * Capture/OCR (đã có): hasConsent, requestConsent, getScreenSize,
 * capture(regionJson?), recognize(imagePath), captureAndOcr(regionJson?).
 * regionJson: '{"x":..,"y":..,"width":..,"height":..}' pixel, null = full.
 *
 * Mới (assistant): assistantScan, syncAssistantData, region get/set,
 * canDrawOverlays, openOverlaySettings, start/stop/isBubbleRunning,
 * openAccessibilitySettings, isAccessibilityConnected, getLastShot.
 */
class QuizCaptureModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  com.facebook.react.bridge.ActivityEventListener {

  companion object {
    const val NAME = "QuizCapture"
    private const val REQ_CAPTURE_CONSENT = 0xCAFE

    @Volatile var consentResultCode: Int = -1
    @Volatile var consentData: Intent? = null

    @Volatile var lastShotPath: String? = null
    @Volatile var lastShotWidth: Int = 0
    @Volatile var lastShotHeight: Int = 0
  }

  private var consentPromise: Promise? = null
  private val io = Executors.newCachedThreadPool()

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  private fun prefs() = QuizPrefs(reactContext)

  private fun parseRegion(s: String?): IntArray? {
    if (s.isNullOrBlank()) return null
    val o = JSONObject(s)
    return intArrayOf(o.getInt("x"), o.getInt("y"), o.getInt("width"), o.getInt("height"))
  }

  private fun rememberShot(shot: QuizShot.Shot) {
    lastShotPath = shot.path
    lastShotWidth = shot.width
    lastShotHeight = shot.height
  }

  // ---------- consent / screen ----------

  @ReactMethod
  fun hasConsent(p: Promise) {
    p.resolve(consentData != null)
  }

  @ReactMethod
  fun requestConsent(p: Promise) {
    val activity = reactApplicationContext.currentActivity
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
      @Suppress("DEPRECATION")
      activity.startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE_CONSENT)
    } catch (e: Exception) {
      consentPromise = null
      p.reject("E_INTENT", e.message)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
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

  override fun onNewIntent(intent: Intent) {}

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

  // ---------- capture / ocr ----------

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
        val shot = QuizShot.captureSync(reactContext, consentResultCode, consentData, region)
        rememberShot(shot)
        val map = Arguments.createMap()
        map.putString("uri", shot.path)
        map.putInt("width", shot.width)
        map.putInt("height", shot.height)
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
        val shot = QuizShot.captureSync(reactContext, consentResultCode, consentData, region)
        rememberShot(shot)
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

  // ---------- assistant scan (dùng region đã lưu + match native) ----------

  @ReactMethod
  fun assistantScan(p: Promise) {
    io.execute {
      try {
        val prefs = prefs()
        // Chụp full rồi crop theo region đã lưu (nếu có) để còn match substring khi chưa crop.
        val shot = QuizShot.captureSync(reactContext, consentResultCode, consentData, null)
        rememberShot(shot)
        val qRegion = prefs.regionToPixels(prefs.getQuestionRegion(), shot.width, shot.height)
        val useExact = qRegion != null
        val text = try {
          if (useExact) {
            // Crop lại từ file full để OCR chính xác vùng câu hỏi.
            val cropped = cropSavedImage(shot.path, qRegion!!) ?: shot.path
            QuizOcrHelper.recognize(reactContext, cropped)
          } else {
            QuizOcrHelper.recognize(reactContext, shot.path)
          }
        } catch (e: Exception) {
          p.reject("E_OCR", e.message)
          return@execute
        }
        val res = if (useExact) {
          QuizMatcherKt.findExact(prefs.questionsJson, text, prefs.selectedSet)
        } else {
          QuizMatcherKt.findBestInText(prefs.questionsJson, text, prefs.selectedSet)
        }
        val map = Arguments.createMap()
        map.putString("uri", shot.path)
        map.putInt("width", shot.width)
        map.putInt("height", shot.height)
        map.putString("text", text)
        map.putString("normalized", res.normalized)
        map.putBoolean("matched", res.matched)
        if (res.correctIndex != null) map.putInt("correctIndex", res.correctIndex) else map.putNull("correctIndex")
        p.resolve(map)
      } catch (e: Exception) {
        p.reject(if (e.message == "Screen capture consent not granted") "E_NO_CONSENT" else "E_SCAN", e.message)
      }
    }
  }

  private fun cropSavedImage(path: String, region: IntArray): String? {
    return try {
      val opts = android.graphics.BitmapFactory.Options().apply { inPreferredConfig = android.graphics.Bitmap.Config.ARGB_8888 }
      val src = android.graphics.BitmapFactory.decodeFile(path, opts) ?: return null
      val x = region[0].coerceIn(0, src.width - 1)
      val y = region[1].coerceIn(0, src.height - 1)
      val w = region[2].coerceIn(1, src.width - x)
      val h = region[3].coerceIn(1, src.height - y)
      val cropped = android.graphics.Bitmap.createBitmap(src, x, y, w, h)
      src.recycle()
      val out = java.io.File(reactContext.cacheDir, "quizcrop_${System.currentTimeMillis()}.png")
      java.io.FileOutputStream(out).use { cropped.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
      cropped.recycle()
      out.absolutePath
    } catch (_: Exception) {
      null
    }
  }

  // ---------- sync từ JS ----------

  @ReactMethod
  fun syncAssistantData(questionsJson: String, selectedSet: String, autoMode: Boolean, clickDelayMs: Double, p: Promise) {
    try {
      prefs().apply {
        this.questionsJson = questionsJson
        this.selectedSet = if (selectedSet == "yamato") "yamato" else "cathay"
        this.autoMode = autoMode
        this.clickDelayMs = clickDelayMs.toLong()
      }
      FloatingBubbleService.refreshFromPrefs(reactContext)
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_SYNC", e.message)
    }
  }

  // ---------- regions ----------

  @ReactMethod
  fun setQuestionRegion(fx: Double, fy: Double, fw: Double, fh: Double, p: Promise) {
    try {
      prefs().setQuestionRegion(fx.toFloat(), fy.toFloat(), fw.toFloat(), fh.toFloat())
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_REGION", e.message)
    }
  }

  @ReactMethod
  fun getQuestionRegion(p: Promise) {
    try {
      val f = prefs().getQuestionRegion()
      if (f == null) {
        p.resolve(null)
      } else {
        val map = Arguments.createMap()
        map.putDouble("fx", f[0].toDouble())
        map.putDouble("fy", f[1].toDouble())
        map.putDouble("fw", f[2].toDouble())
        map.putDouble("fh", f[3].toDouble())
        p.resolve(map)
      }
    } catch (e: Exception) {
      p.reject("E_REGION", e.message)
    }
  }

  @ReactMethod
  fun setAnswerRegion(index: Double, fx: Double, fy: Double, fw: Double, fh: Double, p: Promise) {
    try {
      prefs().setAnswerRegion(index.toInt(), fx.toFloat(), fy.toFloat(), fw.toFloat(), fh.toFloat())
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_REGION", e.message)
    }
  }

  @ReactMethod
  fun getAnswerRegions(p: Promise) {
    try {
      val arr: WritableArray = Arguments.createArray()
      for (i in 0..3) {
        val f = prefs().getAnswerRegion(i)
        if (f == null) {
          arr.pushNull()
        } else {
          val map = Arguments.createMap()
          map.putDouble("fx", f[0].toDouble())
          map.putDouble("fy", f[1].toDouble())
          map.putDouble("fw", f[2].toDouble())
          map.putDouble("fh", f[3].toDouble())
          arr.pushMap(map)
        }
      }
      p.resolve(arr)
    } catch (e: Exception) {
      p.reject("E_REGION", e.message)
    }
  }

  @ReactMethod
  fun getLastShot(p: Promise) {
    try {
      val path = lastShotPath
      if (path == null) {
        p.resolve(null)
      } else {
        val map = Arguments.createMap()
        map.putString("uri", path)
        map.putInt("width", lastShotWidth)
        map.putInt("height", lastShotHeight)
        p.resolve(map)
      }
    } catch (e: Exception) {
      p.reject("E_SHOT", e.message)
    }
  }

  // ---------- overlay / bubble / accessibility ----------

  @ReactMethod
  fun canDrawOverlays(p: Promise) {
    try {
      p.resolve(Settings.canDrawOverlays(reactContext))
    } catch (e: Exception) {
      p.reject("E_OVERLAY", e.message)
    }
  }

  @ReactMethod
  fun openOverlaySettings(p: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactContext.packageName}"),
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      reactContext.startActivity(intent)
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_OVERLAY", e.message)
    }
  }

  @ReactMethod
  fun startBubble(p: Promise) {
    try {
      if (!Settings.canDrawOverlays(reactContext)) {
        p.reject("E_OVERLAY", "Chưa cấp quyền hiển thị trên ứng dụng khác")
        return
      }
      val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
        action = FloatingBubbleService.ACTION_SHOW
      }
      reactContext.startService(intent)
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_BUBBLE", e.message)
    }
  }

  @ReactMethod
  fun stopBubble(p: Promise) {
    try {
      val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
        action = FloatingBubbleService.ACTION_HIDE
      }
      reactContext.startService(intent)
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_BUBBLE", e.message)
    }
  }

  @ReactMethod
  fun isBubbleRunning(p: Promise) {
    p.resolve(FloatingBubbleService.isRunning)
  }

  @ReactMethod
  fun openAccessibilitySettings(p: Promise) {
    try {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      p.resolve(true)
    } catch (e: Exception) {
      p.reject("E_A11Y", e.message)
    }
  }

  @ReactMethod
  fun isAccessibilityConnected(p: Promise) {
    p.resolve(QuizClickService.isConnected)
  }
}
