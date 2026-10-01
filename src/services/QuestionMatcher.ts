// QuestionMatcher.ts — §12, §40 concept
// Exact match sau normalize, filter theo quizSetId. Không fallback chéo bộ.
// Không đoán khi similarity thấp (fuzzy để phase sau, module riêng).

import { normalizeText } from './normalize';
import type { CorrectIndex, QuizQuestion, QuizSetId } from '../models/types';

export interface MatchResult {
  matched: boolean;
  correctIndex: CorrectIndex | null;
  normalized: string;
  questionId?: string;
}

export class QuestionMatcher {
  // index: quizSetId -> Map<normalized, {correctIndex, id}>
  private index = new Map<QuizSetId, Map<string, { correctIndex: CorrectIndex; id: string }>>();

  constructor(questions: QuizQuestion[] = []) {
    this.rebuild(questions);
  }

  rebuild(questions: QuizQuestion[]): void {
    this.index.clear();
    for (const q of questions) {
      const key = normalizeText(q.question);
      if (!key) continue;
      let m = this.index.get(q.quizSetId);
      if (!m) {
        m = new Map();
        this.index.set(q.quizSetId, m);
      }
      // Câu trùng normalized trong cùng bộ: ghi đè theo bản mới nhất.
      m.set(key, { correctIndex: q.correctIndex, id: q.id });
    }
  }

  find(ocrText: string, quizSetId: QuizSetId): MatchResult {
    const normalized = normalizeText(ocrText);
    if (!normalized) return { matched: false, correctIndex: null, normalized };
    const m = this.index.get(quizSetId);
    const hit = m?.get(normalized);
    if (hit) {
      return { matched: true, correctIndex: hit.correctIndex, normalized, questionId: hit.id };
    }
    return { matched: false, correctIndex: null, normalized };
  }

  /**
   * Full-screen OCR chứa cả câu hỏi + đáp án + UI thừa nên không thể exact-match
   * toàn văn. findBestInText tìm câu hỏi đã biết NẰM TRONG text OCR (substring
   * sau normalize), ưu tiên câu dài nhất để tránh match nhầm câu ngắn.
   * Vẫn: filter đúng bộ, không match → null, không đoán.
   */
  findBestInText(ocrText: string, quizSetId: QuizSetId): MatchResult {
    const normalized = normalizeText(ocrText);
    if (!normalized) return { matched: false, correctIndex: null, normalized };
    const m = this.index.get(quizSetId);
    if (!m) return { matched: false, correctIndex: null, normalized };
    let best: { correctIndex: CorrectIndex; id: string; len: number } | null = null;
    for (const [key, v] of m) {
      if (key.length < 4) continue;
      if (normalized.includes(key) && (!best || key.length > best.len)) {
        best = { ...v, len: key.length };
      }
    }
    if (best) {
      return { matched: true, correctIndex: best.correctIndex, normalized, questionId: best.id };
    }
    return { matched: false, correctIndex: null, normalized };
  }
}
