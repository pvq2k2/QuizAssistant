package com.quizassistant.quizassistant

import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Logic chụp dùng chung cho JS bridge và bubble service:
 * start QuizCaptureService với consent data rồi chờ kết quả trên latch.
 * Gọi từ background thread (chờ tối đa 20s).
 */
object QuizShot {

  data class Shot(val path: String, val width: Int, val height: Int)

  @Throws(Exception::class)
  fun captureSync(context: Context, resultCode: Int, data: Intent?, region: IntArray?): Shot {
    if (data == null) throw IllegalStateException("Screen capture consent not granted")
    val latch = CountDownLatch(1)
    QuizCaptureService.pendingLatch = latch
    QuizCaptureService.pendingResult.set(null)
    val intent = Intent(context, QuizCaptureService::class.java).apply {
      action = QuizCaptureService.ACTION_CAPTURE
      putExtra(QuizCaptureService.EXTRA_RESULT_CODE, resultCode)
      putExtra(QuizCaptureService.EXTRA_DATA, data)
      if (region != null) putExtra(QuizCaptureService.EXTRA_REGION, region)
    }
    if (Build.VERSION.SDK_INT >= 26) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
    try {
      if (!latch.await(20, TimeUnit.SECONDS)) throw IllegalStateException("Capture timed out")
      return when (val r = QuizCaptureService.pendingResult.getAndSet(null)) {
        is QuizCaptureService.ShotResult.Ok -> {
          QuizPrefs(context).apply {
            lastShotWidth = r.width
            lastShotHeight = r.height
          }
          Shot(r.path, r.width, r.height)
        }
        is QuizCaptureService.ShotResult.Err -> throw IllegalStateException(r.message)
        null -> throw IllegalStateException("No capture result")
      }
    } finally {
      QuizCaptureService.pendingLatch = null
    }
  }
}
