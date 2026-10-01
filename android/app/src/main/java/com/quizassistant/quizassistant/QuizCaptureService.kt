package com.quizassistant.quizassistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference

/**
 * One-shot screenshot service (other apps included) via MediaProjection.
 *
 * Flow: JS module fills [pendingLatch]/[pendingResult], starts this service with
 * the MediaProjection consent data, then waits on the latch. The service captures
 * one frame (optionally cropped to a pixel region), saves PNG to cacheDir,
 * posts the result and stops itself.
 */
class QuizCaptureService : Service() {

  sealed interface ShotResult {
    data class Ok(val path: String, val width: Int, val height: Int) : ShotResult
    data class Err(val message: String) : ShotResult
  }

  companion object {
    const val ACTION_CAPTURE = "com.quizassistant.quizassistant.action.CAPTURE"
    const val EXTRA_RESULT_CODE = "extra_result_code"
    const val EXTRA_DATA = "extra_data"

    /** intArrayOf(x, y, width, height) in screenshot pixels. Null = full screen. */
    const val EXTRA_REGION = "extra_region"

    private const val CHANNEL_ID = "quiz_capture"
    private const val NOTIF_ID = 1001

    @Volatile var pendingLatch: CountDownLatch? = null
    val pendingResult = AtomicReference<ShotResult?>(null)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action != ACTION_CAPTURE) {
      stopSelf(startId)
      return START_NOT_STICKY
    }
    startForegroundInternal()
    val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
    val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_DATA)
    }
    val region = intent.getIntArrayExtra(EXTRA_REGION)
    Thread {
      try {
        pendingResult.set(doCapture(resultCode, data, region))
      } catch (e: Exception) {
        pendingResult.set(ShotResult.Err(e.message ?: e.toString()))
      } finally {
        try {
          pendingLatch?.countDown()
        } catch (_: Exception) {
        }
        try {
          ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        stopSelf(startId)
      }
    }.start()
    return START_NOT_STICKY
  }

  private fun startForegroundInternal() {
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(
            CHANNEL_ID,
            "QuizAssistant capture",
            NotificationManager.IMPORTANCE_LOW,
          ),
        )
      }
    }
    val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("QuizAssistant")
      .setContentText("Đang chụp màn hình…")
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= 29) {
      ServiceCompat.startForeground(
        this,
        NOTIF_ID,
        notif,
        androidx.content.pm.ServiceInfoCompat.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
      )
    } else {
      ServiceCompat.startForeground(this, NOTIF_ID, notif, 0)
    }
  }

  private fun screenSizePixels(): Pair<Int, Int> {
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    return if (Build.VERSION.SDK_INT >= 30) {
      val b = wm.currentWindowMetrics.bounds
      Pair(b.width(), b.height())
    } else {
      val m = DisplayMetrics()
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getMetrics(m)
      Pair(m.widthPixels, m.heightPixels)
    }
  }

  private fun doCapture(resultCode: Int, data: Intent?, region: IntArray?): ShotResult {
    if (data == null) return ShotResult.Err("Missing MediaProjection consent data")
    val (w, h) = screenSizePixels()
    if (w <= 0 || h <= 0) return ShotResult.Err("Invalid screen size ${w}x$h")

    val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val projection: MediaProjection = mpm.getMediaProjection(resultCode, data)
    var reader: ImageReader? = null
    var vd: VirtualDisplay? = null
    var image: Image? = null
    try {
      reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
      vd = projection.createVirtualDisplay(
        "quizshot",
        w,
        h,
        resources.displayMetrics.densityDpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        null,
      )
      // Give the compositor a moment to deliver a frame.
      var attempts = 0
      while (image == null && attempts < 12) {
        try {
          Thread.sleep(150)
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
        try {
          image = reader.acquireLatestImage()
        } catch (_: Exception) {
          image = null
        }
        attempts++
      }
      val img = image ?: return ShotResult.Err("No frame from VirtualDisplay")
      var bmp = imageToBitmap(img, w, h) ?: return ShotResult.Err("Failed to convert frame")
      var fw = w
      var fh = h
      if (region != null) {
        val cropped = tryCrop(bmp, w, h, region) ?: return ShotResult.Err("Bad region")
        if (cropped !== bmp) {
          bmp.recycle()
          bmp = cropped
        }
        fw = bmp.width
        fh = bmp.height
      }
      val out = File(cacheDir, "quizshot_${System.currentTimeMillis()}.png")
      FileOutputStream(out).use { fos ->
        if (!bmp.compress(Bitmap.CompressFormat.PNG, 100, fos)) {
          return ShotResult.Err("Failed to save PNG")
        }
      }
      bmp.recycle()
      return ShotResult.Ok(out.absolutePath, fw, fh)
    } finally {
      try {
        image?.close()
      } catch (_: Exception) {
      }
      try {
        reader?.close()
      } catch (_: Exception) {
      }
      try {
        vd?.release()
      } catch (_: Exception) {
      }
      try {
        projection.stop()
      } catch (_: Exception) {
      }
    }
  }

  private fun imageToBitmap(image: Image, w: Int, h: Int): Bitmap? {
    return try {
      val plane = image.planes[0]
      val buffer = plane.buffer
      val pixelStride = plane.pixelStride
      val rowStride = plane.rowStride
      val rowPadding = rowStride - pixelStride * w
      val paddedW = w + rowPadding / pixelStride
      var bmp = Bitmap.createBitmap(paddedW, h, Bitmap.Config.ARGB_8888)
      bmp.copyPixelsFromBuffer(buffer)
      if (rowPadding != 0) {
        val cropped = Bitmap.createBitmap(bmp, 0, 0, w, h)
        bmp.recycle()
        bmp = cropped
      }
      bmp
    } catch (_: Exception) {
      null
    }
  }

  private fun tryCrop(src: Bitmap, w: Int, h: Int, region: IntArray): Bitmap? {
    if (region.size != 4) return null
    val x = region[0].coerceIn(0, w - 1)
    val y = region[1].coerceIn(0, h - 1)
    val rw = region[2].coerceIn(1, w - x)
    val rh = region[3].coerceIn(1, h - y)
    if (rw < 8 || rh < 8) return null
    return try {
      Bitmap.createBitmap(src, x, y, rw, rh)
    } catch (_: Exception) {
      null
    }
  }
}
