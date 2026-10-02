package com.quizassistant.quizassistant

import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Logic chụp dùng chung cho JS bridge và bubble service:
 * start QuizCaptureService với consent data rồi chờ kết quả trên latch.
 * Gọi từ background thread (chờ tối đa 20s).
 *
 * Chống chụp chồng nhau: cùng lúc chỉ 1 lần chụp được chạy (ACTIVE).
 * Lần gọi mới trong lúc đang chụp sẽ bị từ chối ngay bằng lỗi thân thiện,
 * thay vì làm hỏng handshake latch/result dùng chung (treo vĩnh viễn).
 * Mỗi lần chụp có số thứ tự (seq); service chỉ post kết quả đúng seq hiện
 * tại nên kết quả cũ/mồ côi không bao giờ đánh lừa lần gọi mới.
 */
object QuizShot {

  data class Shot(val path: String, val width: Int, val height: Int)

  const val EXTRA_SEQ = "extra_seq"

  private val lock = Any()
  private var active = false
  private val seqGen = AtomicInteger(0)

  @Volatile var currentSeq: Int = 0
    private set

  class BusyException : IllegalStateException("Đang chụp, vui lòng đợi xong rồi thử lại.")

  /** Consent chụp đã cũ/hết hiệu lực — JS cần xin lại rồi thử lại 1 lần. */
  class ConsentStaleException(msg: String) : IllegalStateException(msg)

  @Throws(Exception::class)
  fun captureSync(context: Context, resultCode: Int, data: Intent?, region: IntArray?): Shot {
    if (data == null) throw IllegalStateException("Screen capture consent not granted")
    val seq = synchronized(lock) {
      if (active) throw BusyException()
      active = true
      val s = seqGen.incrementAndGet()
      currentSeq = s
      s
    }
    QuizTrace.stage("shot", "seq=$seq start (region=${region != null})")
    val latch = CountDownLatch(1)
    QuizCaptureService.pendingLatch = latch
    QuizCaptureService.pendingResult.set(null)
    try {
      val intent = Intent(context, QuizCaptureService::class.java).apply {
        action = QuizCaptureService.ACTION_CAPTURE
        putExtra(QuizCaptureService.EXTRA_RESULT_CODE, resultCode)
        putExtra(QuizCaptureService.EXTRA_DATA, data)
        putExtra(EXTRA_SEQ, seq)
        if (region != null) putExtra(QuizCaptureService.EXTRA_REGION, region)
      }
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      QuizTrace.stage("shot", "seq=$seq service started, awaiting")
      if (!latch.await(20, TimeUnit.SECONDS)) {
        QuizTrace.stage("shot", "seq=$seq TIMEOUT after 20s")
        throw IllegalStateException("Capture timed out")
      }
      return when (val r = QuizCaptureService.pendingResult.getAndSet(null)) {
        is QuizCaptureService.ShotResult.Ok -> {
          if (r.seq != seq) throw IllegalStateException("Stale capture result")
          QuizTrace.stage("shot", "seq=$seq OK ${r.width}x${r.height}")
          QuizPrefs(context).apply {
            lastShotWidth = r.width
            lastShotHeight = r.height
          }
          Shot(r.path, r.width, r.height)
        }
        is QuizCaptureService.ShotResult.Err -> {
          if (r.seq != seq) throw IllegalStateException("Stale capture result")
          QuizTrace.stage("shot", "seq=$seq ERR stale=${r.staleConsent}: ${r.message}")
          if (r.staleConsent) throw ConsentStaleException(r.message)
          throw IllegalStateException(r.message)
        }
        null -> throw IllegalStateException("No capture result")
      }
    } finally {
      if (QuizCaptureService.pendingLatch === latch) {
        QuizCaptureService.pendingLatch = null
      }
      synchronized(lock) {
        if (currentSeq == seq) active = false
      }
      QuizTrace.persist(context)
    }
  }
}
