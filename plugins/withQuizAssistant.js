// withQuizAssistant — Expo config plugin (CNG-safe).
// Mỗi lần `expo prebuild` (kể cả --clean) plugin sẽ:
//  1. Copy 9 file Kotlin (plugins/quiz-native) vào android/.../com/quizassistant/quizassistant/
//  2. Copy res/ (accessibility config + strings)
//  3. Thêm ML Kit text-recognition vào app/build.gradle
//  4. Khai báo QuizCaptureService (FGS mediaProjection) + FloatingBubbleService
//     + QuizClickService (accessibility) trong AndroidManifest
//  5. Đăng ký QuizCapturePackage trong MainApplication.kt
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
  'QuizPrefs.kt',
  'QuizMatcherKt.kt',
  'QuizShot.kt',
  'FloatingBubbleService.kt',
  'QuizClickService.kt',
];
const MLKIT_DEP = 'implementation("com.google.mlkit:text-recognition:16.0.1")';
const SERVICES = [
  {
    'android:name': '.quizassistant.QuizCaptureService',
    'android:exported': 'false',
    'android:foregroundServiceType': 'mediaProjection',
  },
  {
    'android:name': '.quizassistant.FloatingBubbleService',
    'android:exported': 'false',
  },
];

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

      // Copy res/ (accessibility config + strings), merge cây thư mục.
      copyDir(
        path.join(projectRoot, 'plugins', 'quiz-native', 'res'),
        path.join(platformRoot, 'app/src/main/res'),
      );

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
    for (const attrs of SERVICES) {
      const exists = mainApp.service.some(
        (s) => s.$ && s.$['android:name'] === attrs['android:name'],
      );
      if (!exists) mainApp.service.push({ $: { ...attrs } });
    }
    // Accessibility service: intent-filter + config meta-data.
    const a11y = mainApp.service.find(
      (s) => s.$ && s.$['android:name'] === '.quizassistant.QuizClickService',
    );
    if (!a11y) {
      mainApp.service.push({
        $: {
          'android:name': '.quizassistant.QuizClickService',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.accessibilityservice',
              'android:resource': '@xml/quiz_accessibility_config',
            },
          },
        ],
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

// Copy đệ quy srcDir -> destDir (merge, ghi đè file trùng tên).
function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name);
    const d = path.join(destDir, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function withQuizAssistant(config) {
  config = withQuizNativeFiles(config);
  config = withQuizManifest(config);
  config = withQuizGradleDep(config);
  return config;
}

module.exports = withQuizAssistant;
