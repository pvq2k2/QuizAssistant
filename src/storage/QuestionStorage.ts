// QuestionStorage.ts — §16, §40 concept
// MVP: 1 database chung, bắt buộc quizSetId. AsyncStorage JSON.
// Tách lớp KeyValue để test pure-Node không cần native module.

import type { QuizQuestion, QuizSetId } from '../models/types';

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// In-memory fallback cho test / khi AsyncStorage chưa link.
export class MemoryKV implements KeyValue {
  private map = new Map<string, string>();
  async getItem(k: string) { return this.map.get(k) ?? null; }
  async setItem(k: string, v: string) { this.map.set(k, v); }
}

const QUESTIONS_KEY = '@quiz/questions:v1';

function newId(setId: QuizSetId): string {
  return `${setId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class QuestionStorage {
  constructor(private kv: KeyValue) {}

  async loadAll(): Promise<QuizQuestion[]> {
    const raw = await this.kv.getItem(QUESTIONS_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private async saveAll(qs: QuizQuestion[]): Promise<void> {
    await this.kv.setItem(QUESTIONS_KEY, JSON.stringify(qs));
  }

  async getBySet(setId: QuizSetId): Promise<QuizQuestion[]> {
    return (await this.loadAll()).filter((q) => q.quizSetId === setId);
  }

  async search(setId: QuizSetId, keyword: string): Promise<QuizQuestion[]> {
    const kw = keyword.trim().toLowerCase();
    const list = await this.getBySet(setId);
    if (!kw) return list;
    return list.filter((q) => q.question.toLowerCase().includes(kw));
  }

  async add(setId: QuizSetId, question: string, correctIndex: 0 | 1 | 2 | 3): Promise<QuizQuestion> {
    const all = await this.loadAll();
    const item: QuizQuestion = { id: newId(setId), quizSetId: setId, question: question.trim(), correctIndex };
    all.push(item);
    await this.saveAll(all);
    return item;
  }

  // Sửa không đổi quizSetId (§43).
  async update(id: string, patch: { question?: string; correctIndex?: 0 | 1 | 2 | 3 }): Promise<QuizQuestion | null> {
    const all = await this.loadAll();
    const i = all.findIndex((q) => q.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch, id: all[i].id, quizSetId: all[i].quizSetId };
    await this.saveAll(all);
    return all[i];
  }

  async remove(id: string): Promise<void> {
    const all = await this.loadAll();
    await this.saveAll(all.filter((q) => q.id !== id));
  }

  // Import JSON hàng loạt (§16) — validate tối thiểu.
  async importMany(items: { quizSetId: QuizSetId; question: string; correctIndex: number }[]): Promise<number> {
    const all = await this.loadAll();
    let n = 0;
    for (const it of items) {
      if (!it.question?.trim()) continue;
      if (it.correctIndex !== 0 && it.correctIndex !== 1 && it.correctIndex !== 2 && it.correctIndex !== 3) continue;
      if (it.quizSetId !== 'cathay' && it.quizSetId !== 'yamato') continue;
      all.push({ id: newId(it.quizSetId), quizSetId: it.quizSetId, question: it.question.trim(), correctIndex: it.correctIndex });
      n++;
    }
    await this.saveAll(all);
    return n;
  }
}
