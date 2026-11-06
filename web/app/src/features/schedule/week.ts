// 週の計算（月曜はじまり）。日付は 'YYYY-MM-DD' の文字で扱い、時差の影響を受けない。
const pad = (n: number) => String(n).padStart(2, '0');
export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
};
/** その日を含む週の月曜 */
export const weekStart = (s: string) => {
  const d = parse(s);
  const back = (d.getDay() + 6) % 7;
  return addDays(s, -back);
};
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const dayLabel = (s: string) => {
  const d = parse(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
};
