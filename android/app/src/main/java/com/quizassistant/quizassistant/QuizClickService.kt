package com.quizassistant.quizassistant

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

/**
 * Auto-click đáp án: tap vào tâm answerRegions[correctIndex] sau clickDelayMs.
 * Người dùng phải bật service này trong Cài đặt → Accessibility (không thể
 * tự bật bằng code). JS mở màn hình đó qua openAccessibilitySettings().
 */
class QuizClickService : AccessibilityService() {

  companion object {
    @Volatile var isConnected = false
    @Volatile private var instance: QuizClickService? = null
    private val main = Handler(Looper.getMainLooper())

    fun clickAt(x: Float, y: Float, delayMs: Long) {
      main.postDelayed(
        {
          try {
            instance?.tap(x, y)
          } catch (_: Exception) {
          }
        },
        delayMs.coerceIn(0, 5000),
      )
    }
  }

  override fun onServiceConnected() {
    instance = this
    isConnected = true
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    instance = null
    isConnected = false
    return super.onUnbind(intent)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

  override fun onInterrupt() {}

  private fun tap(x: Float, y: Float) {
    val path = Path().apply { moveTo(x, y) }
    val stroke = GestureDescription.StrokeDescription(path, 0, 100)
    val gesture = GestureDescription.Builder().addStroke(stroke).build()
    dispatchGesture(gesture, null, null)
  }
}
