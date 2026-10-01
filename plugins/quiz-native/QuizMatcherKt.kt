package com.quizassistant.quizassistant

import java.text.Normalizer
import org.json.JSONArray

/**
 * Mirror của src/services/QuestionMatcher.ts + normalize.ts để bubble
 * match được ngay cả khi app JS đang background.
 * Quy tắc: filter đúng bộ, exact trước, full-screen thì substring-best,
 * không match → null, không đoán.
 */
object QuizMatcherKt {

  data class Hit(val correctIndex: Int, val id: String)
  data class Result(val matched: Boolean, val correctIndex: Int?, val normalized: String, val id: String?)

  fun normalize(s: String): String {
    var t = s.replace('đ', 'd').replace('Đ', 'd')
    t = Normalizer.normalize(t, Normalizer.Form.NFD).replace("\\p{Mn}+".toRegex(), "")
    t = t.lowercase()
    t = t.replace("[^\\p{L}\\p{N}\\s]+".toRegex(), "")
    t = t.replace("\\s+".toRegex(), " ").trim()
    return t
  }

  private fun indexOf(questionsJson: String, setId: String): Map<String, Hit> {
    val map = LinkedHashMap<String, Hit>()
    try {
      val arr = JSONArray(questionsJson)
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        if (o.optString("quizSetId") != setId) continue
        val key = normalize(o.optString("question", ""))
        if (key.isEmpty()) continue
        val ci = o.optInt("correctIndex", -1)
        if (ci !in 0..3) continue
        map[key] = Hit(ci, o.optString("id", ""))
      }
    } catch (_: Exception) {
    }
    return map
  }

  /** Exact match — dùng cho text đã crop đúng vùng câu hỏi. */
  fun findExact(questionsJson: String, ocrText: String, setId: String): Result {
    val normalized = normalize(ocrText)
    if (normalized.isEmpty()) return Result(false, null, normalized, null)
    val hit = indexOf(questionsJson, setId)[normalized]
    return if (hit != null) Result(true, hit.correctIndex, normalized, hit.id)
    else Result(false, null, normalized, null)
  }

  /** Substring-best — dùng cho text OCR full-screen. Ưu tiên câu dài nhất. */
  fun findBestInText(questionsJson: String, ocrText: String, setId: String): Result {
    val normalized = normalize(ocrText)
    if (normalized.isEmpty()) return Result(false, null, normalized, null)
    var bestKey = ""
    var best: Hit? = null
    for ((key, hit) in indexOf(questionsJson, setId)) {
      if (key.length < 4) continue
      if (normalized.contains(key) && key.length > bestKey.length) {
        bestKey = key
        best = hit
      }
    }
    return if (best != null) Result(true, best.correctIndex, normalized, best.id)
    else Result(false, null, normalized, null)
  }
}
