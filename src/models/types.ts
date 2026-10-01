// QuizAssistant shared models — §6, §35-38 concept
// Single source of truth for RN + Native bridge.

export type QuizSetId = 'cathay' | 'yamato';

export const QUIZ_SETS: { id: QuizSetId; label: string }[] = [
  { id: 'cathay', label: 'Snail Quiz - Cathay' },
  { id: 'yamato', label: 'Snail Quiz - Yamato' },
];

export type CorrectIndex = 0 | 1 | 2 | 3;

export interface QuizQuestion {
  id: string;
  quizSetId: QuizSetId;
  question: string; // raw text as entered by user
  correctIndex: CorrectIndex;
}

export interface OcrRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuizOcrConfig {
  questionRegion: OcrRegion | null;
  answerRegions: [OcrRegion | null, OcrRegion | null, OcrRegion | null, OcrRegion | null];
}

export type AssistantStatus =
  | 'IDLE'
  | 'CAPTURING'
  | 'OCR_PROCESSING'
  | 'MATCHING'
  | 'ANSWER_FOUND'
  | 'NOT_FOUND'
  | 'ERROR';

export interface AssistantState {
  enabled: boolean;
  autoMode: boolean;
  clickDelayMs: number;
  selectedQuizSet: QuizSetId;
  status: AssistantStatus;
  lastQuestion?: string;
  lastCorrectIndex?: CorrectIndex | null;
}

export const DEFAULT_OCR_CONFIG: QuizOcrConfig = {
  questionRegion: null,
  answerRegions: [null, null, null, null],
};

export const DEFAULT_ASSISTANT_STATE: AssistantState = {
  enabled: false,
  autoMode: false,
  clickDelayMs: 500,
  selectedQuizSet: 'cathay',
  status: 'IDLE',
};

export const CLICK_DELAY_OPTIONS = [0, 100, 250, 500, 1000];

export function isCorrectIndex(v: unknown): v is CorrectIndex {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

export function centerOf(region: OcrRegion): { x: number; y: number } {
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}
