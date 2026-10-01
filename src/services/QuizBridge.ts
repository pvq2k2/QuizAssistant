// QuizBridge.ts — §30 concept: hợp đồng RN ↔ Android Native.
// Khi chưa có native module (Expo Go / dev sớm), dùng MockQuizBridge để UI chạy được.

import type { CorrectIndex, QuizOcrConfig, QuizSetId } from '../models/types';
import { QuestionMatcher } from './QuestionMatcher';
import type { QuizQuestion } from '../models/types';

export interface ScanResult {
  ocrText: string;
  normalized: string;
  matched: boolean;
  correctIndex: CorrectIndex | null;
}

export interface IQuizBridge {
  startAssistant(): Promise<void>;
  stopAssistant(): Promise<void>;
  scanOnce(quizSetId: QuizSetId): Promise<ScanResult>;
  testOcr(): Promise<ScanResult & { rawText: string }>;
  getConfig(): Promise<QuizOcrConfig>;
  setConfig(c: QuizOcrConfig): Promise<void>;
  getSelectedSet(): Promise<QuizSetId>;
  setSelectedSet(s: QuizSetId): Promise<void>;
}

// Mock: OCR giả lập + matcher thật → UI/test không cần device.
export class MockQuizBridge implements IQuizBridge {
  private config: QuizOcrConfig = {
    questionRegion: { x: 100, y: 300, width: 800, height: 200 },
    answerRegions: [null, null, null, null],
  };
  private selected: QuizSetId = 'cathay';
  mockOcrText = 'Ẩm thực Tứ Xuyên nổi tiếng với _____?';

  constructor(private questions: QuizQuestion[] = []) {}

  setQuestions(qs: QuizQuestion[]) { this.questions = qs; }
  async startAssistant() {}
  async stopAssistant() {}
  async getConfig() { return this.config; }
  async setConfig(c: QuizOcrConfig) { this.config = c; }
  async getSelectedSet() { return this.selected; }
  async setSelectedSet(s: QuizSetId) { this.selected = s; }

  async scanOnce(quizSetId: QuizSetId): Promise<ScanResult> {
    const m = new QuestionMatcher(this.questions).find(this.mockOcrText, quizSetId);
    return { ocrText: this.mockOcrText, normalized: m.normalized, matched: m.matched, correctIndex: m.correctIndex };
  }

  async testOcr() {
    const r = await this.scanOnce(this.selected);
    return { ...r, rawText: this.mockOcrText };
  }
}
