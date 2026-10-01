// SettingsStorage.ts — §38, §42 concept (selectedQuizSet dùng chung toàn Assistant)

import type { AssistantState, QuizOcrConfig, QuizSetId } from '../models/types';
import { DEFAULT_ASSISTANT_STATE, DEFAULT_OCR_CONFIG } from '../models/types';
import type { KeyValue } from './QuestionStorage';

const SETTINGS_KEY = '@quiz/settings:v1';
const OCR_CONFIG_KEY = '@quiz/ocr-config:v1';

export interface PersistedSettings {
  selectedQuizSet: QuizSetId;
  autoMode: boolean;
  clickDelayMs: number;
}

export class SettingsStorage {
  constructor(private kv: KeyValue) {}

  async loadSettings(): Promise<PersistedSettings> {
    const raw = await this.kv.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        selectedQuizSet: DEFAULT_ASSISTANT_STATE.selectedQuizSet,
        autoMode: false,
        clickDelayMs: DEFAULT_ASSISTANT_STATE.clickDelayMs,
      };
    }
    try {
      const p = JSON.parse(raw);
      return {
        selectedQuizSet: p.selectedQuizSet === 'yamato' ? 'yamato' : 'cathay',
        autoMode: p.autoMode === true,
        clickDelayMs: typeof p.clickDelayMs === 'number' ? p.clickDelayMs : 500,
      };
    } catch {
      return { selectedQuizSet: 'cathay', autoMode: false, clickDelayMs: 500 };
    }
  }

  async saveSettings(s: PersistedSettings): Promise<void> {
    await this.kv.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  async loadOcrConfig(): Promise<QuizOcrConfig> {
    const raw = await this.kv.getItem(OCR_CONFIG_KEY);
    if (!raw) return structuredCloneDefault();
    try {
      const p = JSON.parse(raw);
      return {
        questionRegion: p.questionRegion ?? null,
        answerRegions: Array.isArray(p.answerRegions) && p.answerRegions.length === 4
          ? p.answerRegions
          : [null, null, null, null],
      };
    } catch {
      return structuredCloneDefault();
    }
  }

  async saveOcrConfig(c: QuizOcrConfig): Promise<void> {
    await this.kv.setItem(OCR_CONFIG_KEY, JSON.stringify(c));
  }
}

function structuredCloneDefault(): QuizOcrConfig {
  return {
    questionRegion: DEFAULT_OCR_CONFIG.questionRegion,
    answerRegions: [...DEFAULT_OCR_CONFIG.answerRegions] as QuizOcrConfig['answerRegions'],
  };
}

export type { AssistantState };
