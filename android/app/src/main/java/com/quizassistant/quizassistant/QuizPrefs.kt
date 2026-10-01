package com.quizassistant.quizassistant

import android.content.Context
import android.content.SharedPreferences

/**
 * SharedPreferences dùng chung giữa JS bridge, bubble và auto-click.
 * Vùng đọc lưu dạng FRACTION 0..1 so với kích thước screenshot để không vỡ
 * khi đổi độ phân giải/xoay màn hình. -1 = chưa cấu hình.
 */
class QuizPrefs(context: Context) {

  private val sp: SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // ---- quiz set / assistant settings (sync từ JS) ----
  var questionsJson: String
    get() = sp.getString(K_QUESTIONS, "[]") ?: "[]"
    set(v) = sp.edit().putString(K_QUESTIONS, v).apply()

  var selectedSet: String
    get() = sp.getString(K_SET, "cathay") ?: "cathay"
    set(v) = sp.edit().putString(K_SET, v).apply()

  var autoMode: Boolean
    get() = sp.getBoolean(K_AUTO, false)
    set(v) = sp.edit().putBoolean(K_AUTO, v).apply()

  var clickDelayMs: Long
    get() = sp.getLong(K_DELAY, 500L)
    set(v) = sp.edit().putLong(K_DELAY, v).apply()

  // ---- regions (fractions) ----
  fun setQuestionRegion(fx: Float, fy: Float, fw: Float, fh: Float) {
    sp.edit()
      .putFloat(K_QX, fx).putFloat(K_QY, fy)
      .putFloat(K_QW, fw).putFloat(K_QH, fh)
      .apply()
  }

  /** floatArrayOf(fx, fy, fw, fh) hoặc null nếu chưa cấu hình. */
  fun getQuestionRegion(): FloatArray? {
    val w = sp.getFloat(K_QW, -1f)
    if (w < 0) return null
    return floatArrayOf(
      sp.getFloat(K_QX, 0f), sp.getFloat(K_QY, 0f),
      w, sp.getFloat(K_QH, -1f),
    ).takeIf { it[3] >= 0 }
  }

  fun setAnswerRegion(index: Int, fx: Float, fy: Float, fw: Float, fh: Float) {
    if (index !in 0..3) return
    sp.edit()
      .putFloat("$K_AX$index", fx).putFloat("$K_AY$index", fy)
      .putFloat("$K_AW$index", fw).putFloat("$K_AH$index", fh)
      .apply()
  }

  fun getAnswerRegion(index: Int): FloatArray? {
    if (index !in 0..3) return null
    val w = sp.getFloat("$K_AW$index", -1f)
    if (w < 0) return null
    val h = sp.getFloat("$K_AH$index", -1f)
    if (h < 0) return null
    return floatArrayOf(sp.getFloat("$K_AX$index", 0f), sp.getFloat("$K_AY$index", 0f), w, h)
  }

  // ---- last screenshot size (để đổi fraction -> px) ----
  var lastShotWidth: Int
    get() = sp.getInt(K_SW, 0)
    set(v) = sp.edit().putInt(K_SW, v).apply()

  var lastShotHeight: Int
    get() = sp.getInt(K_SH, 0)
    set(v) = sp.edit().putInt(K_SH, v).apply()

  /** Đổi fraction thành px, clamp vào ảnh. Trả null nếu region chưa hợp lệ. */
  fun regionToPixels(f: FloatArray?, imgW: Int, imgH: Int): IntArray? {
    if (f == null || imgW <= 0 || imgH <= 0) return null
    val x = (f[0] * imgW).toInt().coerceIn(0, imgW - 1)
    val y = (f[1] * imgH).toInt().coerceIn(0, imgH - 1)
    val w = (f[2] * imgW).toInt().coerceIn(8, imgW - x)
    val h = (f[3] * imgH).toInt().coerceIn(8, imgH - y)
    if (w < 8 || h < 8) return null
    return intArrayOf(x, y, w, h)
  }

  companion object {
    private const val PREFS = "quiz_assistant"
    private const val K_QUESTIONS = "questions_json"
    private const val K_SET = "selected_set"
    private const val K_AUTO = "auto_mode"
    private const val K_DELAY = "click_delay_ms"
    private const val K_QX = "q_fx"
    private const val K_QY = "q_fy"
    private const val K_QW = "q_fw"
    private const val K_QH = "q_fh"
    private const val K_AX = "a_fx_"
    private const val K_AY = "a_fy_"
    private const val K_AW = "a_fw_"
    private const val K_AH = "a_fh_"
    private const val K_SW = "last_shot_w"
    private const val K_SH = "last_shot_h"
  }
}
