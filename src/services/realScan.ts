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
