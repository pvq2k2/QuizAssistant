// Pure-Node tests (node --test). Không cần jest/expo.

const test = require('node:test');
const assert = require('node:assert/strict');

// --- normalize (mirror src/services/normalize.ts) ---
function normalizeText(text) {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

test('normalize: bỏ dấu TV + ký tự đặc biệt', () => {
  assert.equal(normalizeText('Ẩm thực Tứ Xuyên nổi tiếng với _____?'), 'am thuc tu xuyen noi tieng voi');
  assert.equal(normalizeText('Thủ đô của Việt Nam là...'), 'thu do cua viet nam la');
  assert.equal(normalizeText('  Nhiều   khoảng   trắng  '), 'nhieu khoang trang');
});

test('normalize: đ/Đ → d', () => {
  assert.equal(normalizeText('Độ mặn'), 'do man');
});

// --- matcher ---
class QuestionMatcher {
  constructor(qs = []) { this.rebuild(qs); }
  rebuild(qs) {
    this.index = new Map();
    for (const q of qs) {
      const key = normalizeText(q.question);
      if (!key) continue;
      if (!this.index.get(q.quizSetId)) this.index.set(q.quizSetId, new Map());
      this.index.get(q.quizSetId).set(key, { correctIndex: q.correctIndex, id: q.id });
    }
  }
  find(ocr, setId) {
    const normalized = normalizeText(ocr);
    const hit = this.index.get(setId)?.get(normalized);
    return hit ? { matched: true, correctIndex: hit.correctIndex, normalized } : { matched: false, correctIndex: null, normalized };
  }
}

test('matcher: exact match sau normalize', () => {
  const m = new QuestionMatcher([
    { id: 'c1', quizSetId: 'cathay', question: 'ẩm thực tứ xuyên nổi tiếng với', correctIndex: 2 },
  ]);
  const r = m.find('Ẩm thực Tứ Xuyên nổi tiếng với _____?', 'cathay');
  assert.equal(r.matched, true);
  assert.equal(r.correctIndex, 2);
});

test('matcher: không tìm xuyên bộ, không fallback', () => {
  const m = new QuestionMatcher([
    { id: 'c1', quizSetId: 'cathay', question: 'thu do cua viet nam', correctIndex: 0 },
  ]);
  assert.equal(m.find('thu do cua viet nam', 'yamato').matched, false);
  assert.equal(m.find('cau hoi khong ton tai', 'cathay').correctIndex, null);
});

test('matcher: ghi đè khi trùng normalized cùng bộ', () => {
  const m = new QuestionMatcher([
    { id: 'a', quizSetId: 'cathay', question: 'ABC', correctIndex: 0 },
    { id: 'b', quizSetId: 'cathay', question: 'abc!', correctIndex: 3 },
  ]);
  assert.equal(m.find('ABC', 'cathay').correctIndex, 3);
});
