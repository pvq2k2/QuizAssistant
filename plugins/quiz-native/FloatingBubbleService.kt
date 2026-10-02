package com.quizassistant.quizassistant

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Bubble 🤖 nổi trên game/app khác (§23-24 concept):
 * - Kéo di chuyển, chạm để mở/đóng menu.
 * - Menu: kết quả + [Quét] + [Auto] + [Bộ] + [Mở app].
 * - Quét: chụp (region đã lưu) → OCR → match đúng bộ → hiện correctIndex.
 * - Auto Mode: quét lặp 2.5s, bỏ qua khi câu hỏi không đổi, tự click nếu
 *   Accessibility đã bật và đã cấu hình 4 vùng đáp án.
 */
class FloatingBubbleService : Service() {

  companion object {
    const val ACTION_SHOW = "com.quizassistant.quizassistant.action.SHOW_BUBBLE"
    const val ACTION_HIDE = "com.quizassistant.quizassistant.action.HIDE_BUBBLE"

    @Volatile var isRunning = false
    @Volatile private var instance: FloatingBubbleService? = null

    fun refreshFromPrefs(context: Context) {
      instance?.reloadPrefs()
    }
  }

  private var wm: WindowManager? = null
  private var bubble: TextView? = null
  private var panel: LinearLayout? = null
  private var resultView: TextView? = null
  private var autoBtn: Button? = null
  private var setBtn: Button? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var panelParams: WindowManager.LayoutParams? = null
  private val main = Handler(Looper.getMainLooper())
  private var scanning = false
  private var lastNormalized = ""
  private var panelVisible = false

  private val autoLoop = object : Runnable {
    override fun run() {
      val prefs = QuizPrefs(this@FloatingBubbleService)
      if (prefs.autoMode && isRunning) {
        doScan(auto = true)
        main.postDelayed(this, 2500)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_HIDE -> {
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        if (!isRunning) {
          isRunning = true
          instance = this
          showBubble()
          maybeStartAutoLoop()
        } else {
          reloadPrefs()
        }
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    main.removeCallbacks(autoLoop)
    try {
      bubble?.let { wm?.removeView(it) }
    } catch (_: Exception) {
    }
    try {
      panel?.let { wm?.removeView(it) }
    } catch (_: Exception) {
    }
    bubble = null
    panel = null
    isRunning = false
    instance = null
    super.onDestroy()
  }

  fun reloadPrefs() {
    main.post {
      try {
        val prefs = QuizPrefs(this)
        autoBtn?.text = if (prefs.autoMode) "Auto: ON" else "Auto: OFF"
        setBtn?.text = if (prefs.selectedSet == "yamato") "Bộ: Yamato" else "Bộ: Cathay"
        maybeStartAutoLoop()
      } catch (_: Exception) {
      }
    }
  }

  private fun maybeStartAutoLoop() {
    main.removeCallbacks(autoLoop)
    try {
      if (QuizPrefs(this).autoMode) main.postDelayed(autoLoop, 1500)
    } catch (_: Exception) {
    }
  }

  private fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun circleBg(color: Int): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(color)
      setStroke(dp(2), Color.WHITE)
    }

  private fun showBubble() {
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager

    bubble = TextView(this).apply {
      text = "🤖"
      textSize = 26f
      gravity = Gravity.CENTER
      background = circleBg(Color.parseColor("#1F2937"))
      setTextColor(Color.WHITE)
      setOnTouchListener(DragToggleListener())
    }
    bubbleParams = WindowManager.LayoutParams(
      dp(56), dp(56),
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = resources.displayMetrics.widthPixels - dp(76)
      y = resources.displayMetrics.heightPixels / 3
    }
    wm?.addView(bubble, bubbleParams)
    buildPanel()
  }

  private fun pill(text: String): Button =
    Button(this).apply {
      this.text = text
      textSize = 12f
      isAllCaps = false
    }

  private fun buildPanel() {
    val prefs = QuizPrefs(this)
    resultView = TextView(this).apply {
      text = "Đáp án: –"
      textSize = 22f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
    }
    val scanBtn = pill("🔍 Quét").apply { setOnClickListener { doScan(auto = false) } }
    autoBtn = pill(if (prefs.autoMode) "Auto: ON" else "Auto: OFF").apply {
      setOnClickListener {
        val p = QuizPrefs(this@FloatingBubbleService)
        p.autoMode = !p.autoMode
        text = if (p.autoMode) "Auto: ON" else "Auto: OFF"
        lastNormalized = ""
        maybeStartAutoLoop()
      }
    }
    setBtn = pill(if (prefs.selectedSet == "yamato") "Bộ: Yamato" else "Bộ: Cathay").apply {
      setOnClickListener {
        val p = QuizPrefs(this@FloatingBubbleService)
        p.selectedSet = if (p.selectedSet == "yamato") "cathay" else "yamato"
        text = if (p.selectedSet == "yamato") "Bộ: Yamato" else "Bộ: Cathay"
        lastNormalized = ""
      }
    }
    val openBtn = pill("📱 Mở app").apply {
      setOnClickListener { openAppTab(null) }
    }
    val questionsBtn = pill("📚 Câu hỏi").apply {
      setOnClickListener { openAppTab("Questions") }
    }
    val settingsBtn = pill("⚙ Cài đặt").apply {
      setOnClickListener { openAppTab("Settings") }
    }
    val regionBtn = pill("🎯 Vùng đọc").apply {
      setOnClickListener { snapBackgroundForRegionConfig() }
    }
    val closeBtn = pill("✕ Đóng").apply { setOnClickListener { togglePanel(false) } }

    panel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(12), dp(12), dp(12))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(Color.parseColor("#111827"))
        cornerRadius = dp(12).toFloat()
        setStroke(dp(1), Color.WHITE)
      }
      addView(resultView)
      addView(scanBtn)
      addView(autoBtn)
      addView(setBtn)
      addView(openBtn)
      addView(questionsBtn)
      addView(settingsBtn)
      addView(regionBtn)
      addView(closeBtn)
    }
    panelParams = WindowManager.LayoutParams(
      dp(220),
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 20
      y = resources.displayMetrics.heightPixels / 4
    }
  }

  /** Mở app, kèm tab đích để JS tự điều hướng (tab = null → giữ nguyên). */
  private fun openAppTab(tab: String?) {
    try {
      val launch = packageManager.getLaunchIntentForPackage(packageName)
      if (tab != null) launch?.putExtra("quiz_tab", tab)
      launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(launch)
    } catch (_: Exception) {
    }
  }

  /**
   * Cấu hình vùng đọc ngay khi game đang chạy: chụp toàn màn hình hiện tại
   * làm nền, lưu cho editor, rồi mở màn hình editor trong app.
   */
  private fun snapBackgroundForRegionConfig() {
    if (scanning) {
      setResult("Đang chụp, đợi xong rồi bấm lại.")
      return
    }
    scanning = true
    setResult("Đang chụp nền…")
    Thread {
      // Giấu overlay để ảnh nền sạch rồi mới chụp.
      hideOverlayForCleanShot(true)
      try {
        Thread.sleep(450)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
      try {
        val shot = QuizShot.captureSync(
          this, QuizCaptureModule.consentResultCode, QuizCaptureModule.consentData, null,
        )
        QuizCaptureModule.lastShotPath = shot.path
        QuizCaptureModule.lastShotWidth = shot.width
        QuizCaptureModule.lastShotHeight = shot.height
        main.post { openAppTab("Region") }
      } catch (t: Throwable) {
        QuizTrace.error("bubble/snap", t)
        setResult("Lỗi chụp: ${friendlyCaptureError(t)}")
      } finally {
        hideOverlayForCleanShot(false)
        scanning = false
      }
    }.start()
  }

  /** Biến lỗi kỹ thuật thành câu dễ hiểu + gợi ý thao tác tiếp theo. */
  private fun friendlyCaptureError(t: Throwable): String {
    return when (t) {
      is QuizShot.BusyException -> "Đang có lần chụp khác chạy, đợi vài giây rồi bấm lại."
      is QuizShot.ConsentStaleException -> "Quyền chụp đã hết hiệu lực. Mở app → Trang chủ → bấm Quét để cấp lại."
      else -> {
        val m = t.message ?: t.toString()
        if (m.contains("timed out", ignoreCase = true)) {
          "Chụp quá 20s không xong. Thử bấm lại 1 lần; nếu vẫn vậy hãy tắt/mở lại bubble."
        } else {
          m
        }
      }
    }
  }

  private fun togglePanel(show: Boolean) {    panelVisible = show
    try {
      if (show) {
        if (panel?.parent == null) wm?.addView(panel, panelParams)
      } else {
        if (panel?.parent != null) wm?.removeView(panel)
      }
    } catch (_: Exception) {
    }
  }

  private inner class DragToggleListener : View.OnTouchListener {
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private var downT = 0L

    override fun onTouch(v: View, e: MotionEvent): Boolean {
      val p = bubbleParams ?: return false
      when (e.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = e.rawX
          downY = e.rawY
          startX = p.x
          startY = p.y
          downT = System.currentTimeMillis()
        }
        MotionEvent.ACTION_MOVE -> {
          p.x = startX + (e.rawX - downX).toInt()
          p.y = startY + (e.rawY - downY).toInt()
          try {
            wm?.updateViewLayout(bubble, p)
          } catch (_: Exception) {
          }
        }
        MotionEvent.ACTION_UP -> {
          val dx = e.rawX - downX
          val dy = e.rawY - downY
          if (dx * dx + dy * dy < 20 * 20 && System.currentTimeMillis() - downT < 400) {
            togglePanel(!panelVisible)
          }
        }
      }
      return true
    }
  }

  private fun setBubbleText(t: String) {
    main.post {
      try {
        bubble?.text = t
      } catch (_: Exception) {
      }
    }
  }

  private fun setResult(t: String) {
    main.post {
      try {
        resultView?.text = t
        if (panel?.parent == null && panelVisible) {
          try {
            wm?.addView(panel, panelParams)
          } catch (_: Exception) {
          }
        }
      } catch (_: Exception) {
      }
    }
  }

  /**
   * Giấu bubble+panel để ảnh chụp không dính menu (chỉ cho lần chụp thủ công;
   * Auto Mode giữ nguyên để khỏi nhấp nháy). Gọi từ worker thread.
   */
  private fun hideOverlayForCleanShot(hide: Boolean) {
    val latch = java.util.concurrent.CountDownLatch(1)
    main.post {
      try {
        val v = if (hide) View.INVISIBLE else View.VISIBLE
        bubble?.visibility = v
        panel?.visibility = v
      } catch (_: Exception) {
      } finally {
        latch.countDown()
      }
    }
    try {
      latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
    } catch (_: Exception) {
    }
  }

  private fun doScan(auto: Boolean) {
    if (scanning) {
      if (!auto) setResult("Đang quét, đợi xong rồi bấm lại.")
      return
    }
    scanning = true
    if (!auto) setResult("Đang quét…")
    Thread {
      // Chụp thủ công thì giấu overlay để ảnh sạch (auto giữ nguyên).
      val hideForShot = !auto
      try {
        val prefs = QuizPrefs(this)
        if (hideForShot) {
          hideOverlayForCleanShot(true)
          try {
            Thread.sleep(450)
          } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
          }
        }
        val shot = QuizShot.captureSync(
          this, QuizCaptureModule.consentResultCode, QuizCaptureModule.consentData, null,
        )
        val qRegion = prefs.regionToPixels(prefs.getQuestionRegion(), shot.width, shot.height)
        val text = if (qRegion != null) {
          val cropped = cropFile(shot.path, qRegion) ?: shot.path
          QuizOcrHelper.recognize(this, cropped)
        } else {
          QuizOcrHelper.recognize(this, shot.path)
        }
        val res = if (qRegion != null) {
          QuizMatcherKt.findExact(prefs.questionsJson, text, prefs.selectedSet)
        } else {
          QuizMatcherKt.findBestInText(prefs.questionsJson, text, prefs.selectedSet)
        }
        if (auto && res.normalized == lastNormalized) {
          return@Thread
        }
        lastNormalized = res.normalized
        if (res.matched && res.correctIndex != null) {
          setBubbleText(res.correctIndex.toString())
          setResult("Đáp án: ${res.correctIndex}")
          if (auto && prefs.autoMode) {
            tryAutoClick(prefs, shot.width, shot.height, res.correctIndex)
          }
        } else {
          setBubbleText("🤖")
          if (!auto || res.normalized.isNotEmpty()) {
            setResult(if (text.isBlank()) "OCR trống" else "Không tìm thấy")
          }
        }
      } catch (t: Throwable) {
        QuizTrace.error("bubble/doScan", t)
        if (!auto) setResult("Lỗi: ${friendlyCaptureError(t)}")
      } finally {
        if (hideForShot) hideOverlayForCleanShot(false)
        scanning = false
      }
    }.start()
  }

  private fun cropFile(path: String, region: IntArray): String? {
    return try {
      val src = android.graphics.BitmapFactory.decodeFile(path) ?: return null
      val x = region[0].coerceIn(0, src.width - 1)
      val y = region[1].coerceIn(0, src.height - 1)
      val w = region[2].coerceIn(1, src.width - x)
      val h = region[3].coerceIn(1, src.height - y)
      val cropped = android.graphics.Bitmap.createBitmap(src, x, y, w, h)
      src.recycle()
      val out = java.io.File(cacheDir, "quizcrop_${System.currentTimeMillis()}.png")
      java.io.FileOutputStream(out).use {
        cropped.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
      }
      cropped.recycle()
      out.absolutePath
    } catch (_: Exception) {
      null
    }
  }

  private fun tryAutoClick(prefs: QuizPrefs, imgW: Int, imgH: Int, correctIndex: Int) {
    try {
      if (!QuizClickService.isConnected) return
      val f = prefs.getAnswerRegion(correctIndex) ?: return
      val px = prefs.regionToPixels(f, imgW, imgH) ?: return
      val cx = (px[0] + px[2] / 2).toFloat()
      val cy = (px[1] + px[3] / 2).toFloat()
      QuizClickService.clickAt(cx, cy, prefs.clickDelayMs)
    } catch (_: Exception) {
    }
  }
}
