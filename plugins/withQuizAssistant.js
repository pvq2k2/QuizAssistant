// withQuizAssistant — Expo config plugin (CNG-safe).
// Mỗi lần `expo prebuild` (kể cả --clean) plugin sẽ:
//  1. Copy 4 file Kotlin (plugins/quiz-native) vào android/.../com/quizassistant/quizassistant/
//  2. Thêm ML Kit text-recognition vào app/build.gradle
//  3. Khai báo QuizCaptureService (foregroundServiceType=mediaProjection) trong AndroidManifest
//  4. Đăng ký QuizCapturePackage trong MainApplication.kt
//
// Không sửa gì trong android/ bằng tay — mọi thứ tái tạo được từ plugin.

const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');

const PKG_DIR = 'com/quizassistant/quizassistant';
const KT_FILES = [
  'QuizCaptureModule.kt',
  'QuizCapturePackage.kt',
  'QuizCaptureService.kt',
  'QuizOcrHelper.kt',
];
const MLKIT_DEP = 'implementation("com.google.mlkit:text-recognition:16.0.1")';
const SERVICE_NAME = '.quizassistant.QuizCaptureService';

function withQuizNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const destDir = path.join(
        platformRoot,
        'app/src/main/java',
        ...PKG_DIR.split('/'),
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const f of KT_FILES) {
        const src = path.join(projectRoot, 'plugins', 'quiz-native', f);
        if (!fs.existsSync(src)) {
          throw new Error(`[withQuizAssistant] missing template file: ${src}`);
        }
        fs.copyFileSync(src, path.join(destDir, f));
      }

      // Patch MainApplication.kt — đăng ký package (idempotent).
      const appId = cfg.android?.package ?? 'com.quizassistant';
      const mainAppPath = path.join(
        platformRoot,
        'app/src/main/java',
        ...appId.split('.'),
        'MainApplication.kt',
      );
      if (!fs.existsSync(mainAppPath)) {
        throw new Error(`[withQuizAssistant] MainApplication not found: ${mainAppPath}`);
      }
      let src = fs.readFileSync(mainAppPath, 'utf8');
      if (!src.includes('QuizCapturePackage')) {
        const importAnchor = 'import com.facebook.react.PackageList';
        if (!src.includes(importAnchor)) {
          throw new Error('[withQuizAssistant] cannot find PackageList import in MainApplication.kt');
        }
        src = src.replace(
          importAnchor,
          `${importAnchor}\nimport com.quizassistant.quizassistant.QuizCapturePackage`,
        );
        const anchors = [
          '// packages.add(MyReactNativePackage())',
          '// add(MyReactNativePackage())',
        ];
        const anchor = anchors.find((a) => src.includes(a));
        if (anchor) {
          src = src.replace(anchor, 'add(QuizCapturePackage())');
        } else if (src.includes('return packages')) {
          src = src.replace(
            'return packages',
            'packages.add(QuizCapturePackage())\n    return packages',
          );
        } else {
          throw new Error('[withQuizAssistant] cannot find packages insertion point in MainApplication.kt');
        }
        fs.writeFileSync(mainAppPath, src);
      }
      return cfg;
    },
  ]);
}

function withQuizManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const apps = manifest.application ?? [];
    const mainApp = apps[0];
    if (!mainApp) throw new Error('[withQuizAssistant] no <application> in manifest');
    mainApp.service = mainApp.service ?? [];
    const exists = mainApp.service.some(
      (s) => s.$ && s.$['android:name'] === SERVICE_NAME,
    );
    if (!exists) {
      mainApp.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaProjection',
        },
      });
    }
    return cfg;
  });
}

function withQuizGradleDep(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('com.google.mlkit:text-recognition')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${MLKIT_DEP}`,
      );
      cfg.modResults.contents = contents;
    }
    return cfg;
  });
}

function withQuizAssistant(config) {
  config = withQuizNativeFiles(config);
  config = withQuizManifest(config);
  config = withQuizGradleDep(config);
  return config;
}

module.exports = withQuizAssistant;
