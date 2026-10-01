package com.quizassistant.quizassistant

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class QuizCapturePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == QuizCaptureModule.NAME) QuizCaptureModule(reactContext) else null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        QuizCaptureModule.NAME to ReactModuleInfo(
          QuizCaptureModule.NAME,
          QuizCaptureModule::class.java.name,
          false,
          false,
          false,
          true,
        ),
      )
    }
  }
}
