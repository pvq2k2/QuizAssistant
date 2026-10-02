// realScan.ts — cầu nối JS ↔ native QuizCaptureModule (dev-build Android).
// Expo Go: isNativeCaptureAvailable() === false → UI ẩn nút quét thật.

import { NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';

// Lấy module native qua cả 2 đường (legacy proxy + turbo registry) để không
// lỗi câm nếu RN đổi cơ chế lookup trong bản nâng cấp sau.
function resolveNativeModule(): any {
  const viaLegacy = (NativeModules as any)?.QuizCapture;
  if (viaLegacy) return viaLegacy;
  try {
    return (TurboModuleRegistry as any)?.get?.('QuizCapture') ?? null;
  } catch {
    return null;
  }
}

const M: any = resolveNativeModule();

export const isNativeCaptureAvailable = (): boolean =>
  Platform.OS === 'android' && !!M;

/** Method native có tồn tại không — phát hiện APK cũ thiếu tính năng mới. */
export function hasNativeMethod(name: string): boolean {
  return isNativeCaptureAvailable() && typeof M[name] === 'function';
}

/** Yêu cầu các method tối thiểu của bản full; báo rõ nếu APK quá cũ. */
function requireMethods(names: string[]): void {
  if (!isNativeCaptureAvailable()) {
    throw new Error('Chức năng này chỉ chạy trên dev-build Android (không chạy trên Expo Go).');
  }
  const missing = names.filter((n) => typeof M[n] !== 'function');
  if (missing.length > 0) {
    throw new Error(
      `APK trên máy thiếu: ${missing.join(', ')}. Hãy cài bản APK mới nhất rồi thử lại.`,
    );
  }
}

export async function getLaunchTab(): Promise<string | null> {
  if (!hasNativeMethod('getLaunchTab')) return null;
  return M.getLaunchTab();
}

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureOcrResult {
  uri: string;
  width: number;
  height: number;
  text: string;
}

async function ensureCaptureReady(): Promise<void> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await requestPostNotifications().catch(() => false);
  }
  const ok = await requestCaptureConsent();
  if (!ok) throw new Error('Bạn đã từ chối quyền chụp màn hình.');
}

/** Chạy fn, nếu consent cũ thì xin lại 1 lần rồi thử lại đúng 1 lần. */
async function withConsentRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    const code = e?.code;
    if (code !== 'E_CONSENT_STALE') throw e;
    await M.clearConsent().catch(() => {});
    const ok = await requestCaptureConsent();
    if (!ok) throw new Error('Quyền chụp màn hình đã hết hiệu lực và bạn đã từ chối cấp lại.');
    return fn();
  }
}

/** Xin quyền chụp màn hình (hiện dialog hệ thống). Trả true nếu đã được cấp. */
export async function requestCaptureConsent(): Promise<boolean> {
  requireMethods(['hasConsent', 'requestConsent']);
  const has: boolean = await M.hasConsent();
  if (has) return true;
  return M.requestConsent();
}

/** Xin quyền hiện thông báo (cần cho foreground service Android 13+). */
export async function requestPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  try {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Chụp màn hình thật (kể cả app/game khác) + OCR ML Kit on-device. */
export async function captureAndOcr(region?: PixelRegion): Promise<CaptureOcrResult> {
  if (!isNativeCaptureAvailable()) {
    throw new Error('Chụp màn hình thật chỉ chạy trên dev-build Android.');
  }
  await ensureCaptureReady();
  return withConsentRetry(async () => {
    const r = await M.captureAndOcr(region ? JSON.stringify(region) : null);
    return { uri: r.uri, width: r.width, height: r.height, text: r.text ?? '' };
  });
}

export interface FractionRegion {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}

export interface AssistantScanResult extends CaptureOcrResult {
  normalized: string;
  matched: boolean;
  correctIndex: number | null;
}

export interface LastShot {
  uri: string;
  width: number;
  height: number;
}

function guardNative(): void {
  if (!isNativeCaptureAvailable()) {
    throw new Error('Chức năng này chỉ chạy trên dev-build Android.');
  }
}

/** Quét bằng region + DB đã lưu trong native (bubble và JS dùng chung). */
export async function assistantScan(): Promise<AssistantScanResult> {
  guardNative();
  await ensureCaptureReady();
  return withConsentRetry(async () => {
    const r = await M.assistantScan();
    return {
      uri: r.uri,
      width: r.width,
      height: r.height,
      text: r.text ?? '',
      normalized: r.normalized ?? '',
      matched: !!r.matched,
      correctIndex: r.correctIndex ?? null,
    };
  });
}

/** Đẩy toàn bộ DB + settings sang native để bubble chạy độc lập. */
export async function syncAssistantData(
  questions: { id: string; quizSetId: string; question: string; correctIndex: number }[],
  selectedSet: string,
  autoMode: boolean,
  clickDelayMs: number,
): Promise<void> {
  guardNative();
  await M.syncAssistantData(JSON.stringify(questions), selectedSet, autoMode, clickDelayMs);
}

export async function setQuestionRegion(f: FractionRegion): Promise<void> {
  guardNative();
  await M.setQuestionRegion(f.fx, f.fy, f.fw, f.fh);
}

export async function getQuestionRegion(): Promise<FractionRegion | null> {
  guardNative();
  return M.getQuestionRegion();
}

export async function setAnswerRegion(index: number, f: FractionRegion): Promise<void> {
  guardNative();
  await M.setAnswerRegion(index, f.fx, f.fy, f.fw, f.fh);
}

export async function getAnswerRegions(): Promise<(FractionRegion | null)[]> {
  guardNative();
  return M.getAnswerRegions();
}

export async function getLastShot(): Promise<LastShot | null> {
  guardNative();
  return M.getLastShot();
}

/** Chụp full màn hình chỉ để lấy ảnh preview cho editor (không OCR). */
export async function capturePreview(): Promise<LastShot> {
  guardNative();
  await ensureCaptureReady();
  const r = await M.capture(null);
  return { uri: r.uri, width: r.width, height: r.height };
}

export async function canDrawOverlays(): Promise<boolean> {
  guardNative();
  return M.canDrawOverlays();
}

export async function openOverlaySettings(): Promise<void> {
  guardNative();
  await M.openOverlaySettings();
}

export async function startBubble(): Promise<void> {
  requireMethods(['startBubble']);
  await M.startBubble();
}

export async function stopBubble(): Promise<void> {
  requireMethods(['stopBubble']);
  await M.stopBubble();
}

export async function isBubbleRunning(): Promise<boolean> {
  requireMethods(['isBubbleRunning']);
  return M.isBubbleRunning();
}

export async function openAccessibilitySettings(): Promise<void> {
  guardNative();
  await M.openAccessibilitySettings();
}

export async function isAccessibilityConnected(): Promise<boolean> {
  guardNative();
  return M.isAccessibilityConnected();
}

/** Đã cấp quyền chụp màn hình (MediaProjection consent) chưa. */
export async function hasCaptureConsent(): Promise<boolean> {
  guardNative();
  return M.hasConsent();
}

/** Đọc hộp đen trace lần chụp gần nhất (chẩn đoán không cần adb). */
export async function getCaptureTrace(): Promise<string> {
  if (!hasNativeMethod('getCaptureTrace')) return '';
  try {
    return (await M.getCaptureTrace()) ?? '';
  } catch {
    return '';
  }
}

export async function clearCaptureTrace(): Promise<void> {
  if (!hasNativeMethod('clearCaptureTrace')) return;
  try {
    await M.clearCaptureTrace();
  } catch {}
}
