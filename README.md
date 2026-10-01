# QuizAssistant

App React Native (Expo) hỗ trợ trả lời quiz: chụp màn hình vùng câu hỏi → OCR → chuẩn hóa text → tra database câu hỏi đã lưu → trả về index đáp án đúng (`0 | 1 | 2 | 3`) và hiển thị trên floating bubble Android.

> Concept chi tiết: `QuizAssistant_OCR_Concept.md`. Hướng dẫn native: `docs/NATIVE_SETUP.md`.

## Tính năng

- **3 tab chính:** Trang chủ (Home) / Câu hỏi (Questions) / Cài đặt (Settings).
- **2 bộ câu hỏi độc lập:** `Snail Quiz - Cathay` và `Snail Quiz - Yamato` (`quizSetId: 'cathay' | 'yamato'`), filter theo bộ, scan chỉ tìm trong bộ đang chọn, không fallback xuyên bộ.
- **Quản lý câu hỏi:** danh sách, tìm kiếm, thêm / sửa / xóa, mỗi câu chỉ lưu `question + correctIndex`.
- **Cấu hình vùng OCR:** `questionRegion` (bắt buộc) + 4 `answerRegions` (dành cho auto-click tương lai), kéo/resize, persist qua restart.
- **Pipeline OCR:** `Screenshot → Crop questionRegion → OCR → Normalize → QuestionMatcher → correctIndex | null`.
- **Floating bubble Android (native):** nút quét thủ công, chọn bộ câu hỏi nhanh, Auto Mode (UI/state trước, native auto-click làm sau).
- **MockQuizBridge:** RN UI chạy được trên Expo Go mà chưa cần native module.

## Stack

- Expo `~57`, React `19.2.3`, React Native `0.86.3`, TypeScript `~6.0`
- `@react-navigation/native + bottom-tabs + native-stack`, `async-storage`, `expo-dev-client`, `expo-asset`
- Native (Android): MediaProjection (screenshot), ML Kit Text Recognition, `SYSTEM_ALERT_WINDOW` overlay, AccessibilityService (auto-click, làm sau)

## Cấu trúc

```text
App.tsx                  # SafeArea + StatusBar + AppStore + RootNavigator
index.js / babel.config.js / app.json / tsconfig.json
src/
  models/types.ts        # QuizQuestion, QuizSetId, OcrRegion, QuizOcrConfig, AssistantState
  navigation/RootNavigator.tsx  # BottomTab 3 tabs → Stacks con
  screens/               # Home, Questions, QuestionEdit, Settings, OcrRegion
  services/              # normalize, QuestionMatcher, QuizBridge (+Mock), realScan
  storage/               # QuestionStorage, SettingsStorage (AsyncStorage)
  store/AppStore.tsx
  theme.ts
plugins/withQuizAssistant.js # expo config plugin (permissions, manifest)
test/core.test.js        # test pure-Node: normalize + matcher
docs/NATIVE_SETUP.md
android/                 # sinh bởi `expo prebuild`, đã có .gitignore riêng
```

## Yêu cầu

- Node.js LTS (18+), npm
- Android Studio + SDK + device/emulator (chỉ cần cho phần native/bubble)
- Expo CLI đi kèm `npx expo` (không cần cài global)

## Chạy nhanh

```powershell
npm install
npx expo start          # quét QR bằng Expo Go (UI + Mock, chưa có bubble thật)
npm run android         # expo run:android — cần prebuild + device
npm test                # node --test test/*.test.js
npm run typecheck       # tsc --noEmit
```

Prebuild Android (1 lần khi làm native):

```powershell
npx expo prebuild --platform android
```

Quyền Android đã khai báo trong `app.json`: `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PROJECTION`, `POST_NOTIFICATIONS`. Runtime xin thêm: Overlay, MediaProjection consent, Accessibility (cho auto-click).

## Cách hoạt động (MVP)

```text
SCREENSHOT → CROP questionRegion → OCR → NORMALIZE → MATCH → correctIndex 0/1/2/3 → HIỂN THỊ
```

Normalize (`src/services/normalize.ts`): `đ/Đ → d`, NFD bỏ dấu, lowercase, bỏ ký tự đặc biệt, gộp khoảng trắng, trim. Ví dụ `"Ẩm thực Tứ Xuyên nổi tiếng với _____?"` → `"am thuc tu xuyen noi tieng voi"`.

Matcher (`src/services/QuestionMatcher.ts`): exact-match sau normalize theo `Map<quizSetId, Map<normalized, correctIndex>>`, O(1). Không match → `null`, không đoán bừa, không fuzzy ở MVP.

Model:

```ts
interface QuizQuestion { id: string; quizSetId: 'cathay' | 'yamato'; question: string; correctIndex: 0 | 1 | 2 | 3; }
interface QuizOcrConfig { questionRegion: OcrRegion | null; answerRegions: [OcrRegion|null, OcrRegion|null, OcrRegion|null, OcrRegion|null]; }
```

## Native setup

Xem `docs/NATIVE_SETUP.md`: thêm ML Kit vào `android/app/build.gradle`, khai báo AccessibilityService, implement `OcrRegionManager → ScreenshotManager → OcrManager → FloatingBubbleService → QuizBridgeModule`, test bằng Settings → Test OCR.

## Test

- `npm test` — test normalize (tiếng Việt, `đ`, khoảng trắng) và matcher (exact match, không xuyên bộ, ghi đè khi trùng normalized).
- `npm run typecheck` — kiểm tra TypeScript toàn `src/` + `test/`.
- Test OCR trên device: Settings → Test OCR → kiểm tra `{ocrText, normalized, matched, correctIndex}` (§15 concept).

## Roadmap

MVP: 3 tabs, CRUD câu hỏi theo 2 bộ, cấu hình `questionRegion`, scan thủ công, bubble hiển thị index. Chưa làm: OCR 4 đáp án, fuzzy matching, AI đoán đáp án, auto-click (đã chừa `answerRegions`, `autoMode`, `clickDelayMs` trong model).
