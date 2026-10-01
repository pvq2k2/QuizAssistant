// AppStore — state dùng chung toàn app (§38 concept: selectedQuizSet xuyên suốt).
// Nạp settings + questions từ AsyncStorage, seed lần đầu, expose CRUD + scan (matcher thật).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CorrectIndex, QuizQuestion, QuizSetId } from '../models/types';
import { QuestionMatcher } from '../services/QuestionMatcher';
import type { ScanResult } from '../services/QuizBridge';
import { QuestionStorage, MemoryKV } from '../storage/QuestionStorage';
import type { KeyValue } from '../storage/QuestionStorage';
import { SettingsStorage } from '../storage/SettingsStorage';
import { AsyncStorageKV } from '../storage/asyncStorageKV';
import seedData from '../../assets/questions.seed.json';

const SEED_FLAG_KEY = '@quiz/seeded:v1';

interface AppStoreValue {
  ready: boolean;
  questions: QuizQuestion[];
  countCathay: number;
  countYamato: number;
  selectedSet: QuizSetId;
  setSelectedSet(s: QuizSetId): Promise<void>;
  autoMode: boolean;
  setAutoMode(b: boolean): Promise<void>;
  clickDelayMs: number;
  setClickDelayMs(n: number): Promise<void>;
  enabled: boolean;
  setEnabled(b: boolean): void;
  addQuestion(setId: QuizSetId, question: string, correctIndex: CorrectIndex): Promise<void>;
  updateQuestion(id: string, patch: { question?: string; correctIndex?: CorrectIndex }): Promise<void>;
  removeQuestion(id: string): Promise<void>;
  importJson(text: string): Promise<{ ok: number; error?: string }>;
  exportJson(setId: QuizSetId | 'all'): string;
  scan(ocrText: string, setId: QuizSetId): ScanResult;
  /** Match câu hỏi nằm trong text OCR full-screen (substring sau normalize). */
  scanFullText(ocrText: string, setId: QuizSetId): ScanResult;
}

const AppStoreCtx = createContext<AppStoreValue | null>(null);

export function useAppStore(): AppStoreValue {
  const v = useContext(AppStoreCtx);
  if (!v) throw new Error('useAppStore must be used inside AppStoreProvider');
  return v;
}

let kvInstance: KeyValue | null = null;
function getKV(): KeyValue {
  if (!kvInstance) {
    try {
      kvInstance = new AsyncStorageKV();
    } catch {
      kvInstance = new MemoryKV();
    }
  }
  return kvInstance;
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selectedSet, setSelectedSetState] = useState<QuizSetId>('cathay');
  const [autoMode, setAutoModeState] = useState(false);
  const [clickDelayMs, setClickDelayMsState] = useState(500);
  const [enabled, setEnabled] = useState(false);

  const stores = useMemo(() => {
    const kv = getKV();
    return { qs: new QuestionStorage(kv), ss: new SettingsStorage(kv), kv };
  }, []);

  const reload = useCallback(async () => {
    const [all, settings] = await Promise.all([
      stores.qs.loadAll(),
      stores.ss.loadSettings(),
    ]);
    // Seed lần đầu: chưa seed + db trống → nạp seed.
    const seeded = await stores.kv.getItem(SEED_FLAG_KEY);
    if (!seeded && all.length === 0) {
      await stores.qs.importMany(seedData as { quizSetId: QuizSetId; question: string; correctIndex: number }[]);
      await stores.kv.setItem(SEED_FLAG_KEY, '1');
      const fresh = await stores.qs.loadAll();
      setQuestions(fresh);
    } else {
      setQuestions(all);
    }
    setSelectedSetState(settings.selectedQuizSet);
    setAutoModeState(settings.autoMode);
    setClickDelayMsState(settings.clickDelayMs);
    setReady(true);
  }, [stores]);

  useEffect(() => {
    reload().catch(() => setReady(true));
  }, [reload]);

  const persistSettings = useCallback(
    async (patch: Partial<{ selectedQuizSet: QuizSetId; autoMode: boolean; clickDelayMs: number }>) => {
      const cur = await stores.ss.loadSettings();
      await stores.ss.saveSettings({ ...cur, ...patch });
    },
    [stores],
  );

  const setSelectedSet = useCallback(
    async (s: QuizSetId) => {
      setSelectedSetState(s);
      await persistSettings({ selectedQuizSet: s });
    },
    [persistSettings],
  );

  const setAutoMode = useCallback(
    async (b: boolean) => {
      setAutoModeState(b);
      await persistSettings({ autoMode: b });
    },
    [persistSettings],
  );

  const setClickDelayMs = useCallback(
    async (n: number) => {
      setClickDelayMsState(n);
      await persistSettings({ clickDelayMs: n });
    },
    [persistSettings],
  );

  const addQuestion = useCallback(
    async (setId: QuizSetId, question: string, correctIndex: CorrectIndex) => {
      await stores.qs.add(setId, question, correctIndex);
      setQuestions(await stores.qs.loadAll());
    },
    [stores],
  );

  const updateQuestion = useCallback(
    async (id: string, patch: { question?: string; correctIndex?: CorrectIndex }) => {
      await stores.qs.update(id, patch);
      setQuestions(await stores.qs.loadAll());
    },
    [stores],
  );

  const removeQuestion = useCallback(
    async (id: string) => {
      await stores.qs.remove(id);
      setQuestions(await stores.qs.loadAll());
    },
    [stores],
  );

  const importJson = useCallback(
    async (text: string): Promise<{ ok: number; error?: string }> => {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const n = await stores.qs.importMany(arr);
        setQuestions(await stores.qs.loadAll());
        return { ok: n };
      } catch {
        return { ok: 0, error: 'JSON không hợp lệ' };
      }
    },
    [stores],
  );

  const exportJson = useCallback(
    (setId: QuizSetId | 'all'): string => {
      const list = setId === 'all' ? questions : questions.filter((q) => q.quizSetId === setId);
      return JSON.stringify(list.map(({ quizSetId, question, correctIndex }) => ({ quizSetId, question, correctIndex })), null, 2);
    },
    [questions],
  );

  const scan = useCallback(
    (ocrText: string, setId: QuizSetId): ScanResult => {
      const m = new QuestionMatcher(questions).find(ocrText, setId);
      return { ocrText, normalized: m.normalized, matched: m.matched, correctIndex: m.correctIndex };
    },
    [questions],
  );

  const scanFullText = useCallback(
    (ocrText: string, setId: QuizSetId): ScanResult => {
      const m = new QuestionMatcher(questions).findBestInText(ocrText, setId);
      return { ocrText, normalized: m.normalized, matched: m.matched, correctIndex: m.correctIndex };
    },
    [questions],
  );

  const value: AppStoreValue = {
    ready,
    questions,
    countCathay: questions.filter((q) => q.quizSetId === 'cathay').length,
    countYamato: questions.filter((q) => q.quizSetId === 'yamato').length,
    selectedSet,
    setSelectedSet,
    autoMode,
    setAutoMode,
    clickDelayMs,
    setClickDelayMs,
    enabled,
    setEnabled,
    addQuestion,
    updateQuestion,
    removeQuestion,
    importJson,
    exportJson,
    scan,
    scanFullText,
  };

  return <AppStoreCtx.Provider value={value}>{children}</AppStoreCtx.Provider>;
}
