// normalize.ts — §6 concept
// lowercase → bỏ dấu TV (NFD) → bỏ ký tự đặc biệt → collapse space → trim.
// Lưu ý: đ/Đ không phân tách bởi NFD nên xử lý riêng.

export function normalizeText(text: string): string {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
