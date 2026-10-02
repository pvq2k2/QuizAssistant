package com.quizassistant.quizassistant

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Hộp đen chụp màn hình: ghi từng giai đoạn + thời gian + lỗi vào ring buffer
 * và file cache quiz_trace.txt. JS đọc qua getCaptureTrace() để chẩn đoán
 * mà không cần adb logcat. Mọi thao tác đều best-effort, không bao giờ ném lỗi.
 */
object QuizTrace {

  private const val MAX_LINES = 80
  private const val FILE_NAME = "quiz_trace.txt"

  private val lock = Any()
  private val lines = ArrayDeque<String>()

  private fun stamp(): String {
    return try {
      SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
    } catch (_: Exception) {
      "?"
    }
  }

  fun stage(tag: String, msg: String) {
    try {
      val line = "${stamp()} [$tag] $msg"
      synchronized(lock) {
        lines.addLast(line)
        while (lines.size > MAX_LINES) lines.removeFirst()
      }
    } catch (_: Exception) {
    }
  }

  fun error(tag: String, t: Throwable?) {
    try {
      stage(tag, "ERROR: ${t?.javaClass?.simpleName}: ${t?.message}")
    } catch (_: Exception) {
    }
  }

  fun snapshot(): String {
    return try {
      synchronized(lock) { lines.joinToString("\n") }
    } catch (_: Exception) {
      ""
    }
  }

  fun persist(context: Context) {
    try {
      File(context.cacheDir, FILE_NAME).writeText(snapshot())
    } catch (_: Exception) {
    }
  }

  fun loadPersisted(context: Context): String {
    return try {
      val f = File(context.cacheDir, FILE_NAME)
      if (f.exists()) f.readText() else ""
    } catch (_: Exception) {
      ""
    }
  }

  fun clear(context: Context) {
    try {
      synchronized(lock) { lines.clear() }
      File(context.cacheDir, FILE_NAME).delete()
    } catch (_: Exception) {
    }
  }
}
