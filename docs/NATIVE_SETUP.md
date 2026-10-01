# Native setup (chạy 1 lần khi có máy dev Android)

> RN UI (P0–P2) chạy được với `MockQuizBridge` mà chưa cần native.
> P3/P4 dưới đây cần `expo prebuild` để sinh thư mục `android/` thật, rồi copy `android/stubs/*.kt` vào package `com.quizassistant`.

## 1. Prebuild
```powershell
npm install
npx expo prebuild --platform android
```

## 2. Permissions (đã khai báo trước trong app.json)
- `SYSTEM_ALERT_WINDOW` (bubble + region overlay)
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PROJECTION` (screenshot Android 14+)
- `POST_NOTIFICATIONS` (foreground notification)

Vào runtime xin thêm: Overlay (`Settings.canDrawOverlays`), MediaProjection consent, Accessibility (cho auto-click).

## 3. Dependencies native
`android/app/build.gradle`:
```gradle
implementation("com.google.mlkit:text-recognition:16.0.1")
```

## 4. AccessibilityService (auto-click)
- Khai báo service trong `AndroidManifest.xml`
- `res/xml/accessibility_service_config.xml` (eventTypes rỗng, chỉ dùng dispatchGesture)
- Click: `center(answerRegions[correctIndex])` sau `clickDelayMs`

## 5. Test OCR (§15)
Settings → Test OCR → `capture → crop questionRegion → ML Kit → hiển thị {ocrText, normalized, matched, correctIndex}`.
Nếu OCR sai do font game: tăng crop padding, thử grayscale/threshold trước khi đưa vào ML Kit.

## 6. Thứ tự làm tiếp
1. `expo run:android` + xin quyền overlay
2. Implement `OcrRegionManager` persist thật (SharedPrefs) + overlay drag/resize
3. `ScreenshotManager` (MediaProjection) + `OcrManager` (ML Kit vi)
4. `FloatingBubbleService` menu + set selector + scanOnce
5. `QuizBridgeModule` (ReactContextBaseJavaModule) nối với `src/services/QuizBridge.ts`
6. Accessibility click cuối cùng, test với `clickDelayMs` 500ms
