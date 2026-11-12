export function yen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

export function num(n: number, digits = 1): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** 寸法表示用。常に小数 1〜2 桁でそろえる */
export function meters(n: number): string {
  const r = Math.round(n * 100) / 100;
  return (Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2)) + 'm';
}

export function todayISO(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function jpDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** 浮動小数の誤差を落とす（cm 単位に丸める） */
export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 全角数字などを半角にして数値化。数値でなければ null */
export function parseNumber(text: string): number | null {
  const t = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[，,]/g, '')
    .replace(/[ー−－]/g, '-')
    .trim();
  if (t === '' || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
