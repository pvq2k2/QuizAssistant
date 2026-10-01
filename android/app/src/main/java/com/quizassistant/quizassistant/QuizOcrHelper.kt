package com.quizassistant.quizassistant

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * ML Kit on-device Text Recognition (Latin script — covers Vietnamese).
 * The Latin model is bundled with the library: works fully offline.
 * Must be called off the main thread (Tasks.await blocks).
 */
object QuizOcrHelper {
  @Throws(Exception::class)
  fun recognize(context: Context, imagePath: String): String {
    val client = TextRecognition.getClient(TextRecognizerOptions.Builder().build())
    try {
      val image = InputImage.fromFilePath(context, Uri.fromFile(File(imagePath)))
      val result = Tasks.await(client.process(image), 30, TimeUnit.SECONDS)
      return result?.text ?: ""
    } finally {
      try {
        client.close()
      } catch (_: Exception) {
      }
    }
  }
}
