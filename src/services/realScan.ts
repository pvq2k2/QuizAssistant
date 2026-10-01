// realScan.ts — cầu nối JS ↔ native QuizCaptureModule (dev-build Android).
// Expo Go: isNativeCaptureAvailable() === false → UI ẩn nút quét thật.

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const M: any = (NativeModules as any)?.QuizCapture;

export const isNativeCaptureAvailable = (): boolean =>
  Platform.OS === 'android' && !!M;

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
    try {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    } catch {
      // Không chặn flow nếu xin quyền notification thất bại.
    }
  }
  const has: boolean = await M.hasConsent();
  if (!has) {
    const granted: boolean = await M.requestConsent();
    if (!granted) throw new Error('Bạn đã từ chối quyền chụp màn hình.');
  }
}

/** Chụp màn hình thật (kể cả app/game khác) + OCR ML Kit on-device. */
export async function captureAndOcr(region?: PixelRegion): Promise<CaptureOcrResult> {
  if (!isNativeCaptureAvailable()) {
    throw new Error('Chụp màn hình thật chỉ chạy trên dev-build Android.');
  }
  await ensureCaptureReady();
  const r = await M.captureAndOcr(region ? JSON.stringify(region) : null);
  return { uri: r.uri, width: r.width, height: r.height, text: r.text ?? '' };
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
  guardNative();
  await M.startBubble();
}

export async function stopBubble(): Promise<void> {
  guardNative();
  await M.stopBubble();
}

export async function isBubbleRunning(): Promise<boolean> {
  guardNative();
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
