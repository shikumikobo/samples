// デモの「今日」。実際の日付ではなく 2026-11-09（月）に固定する（DB の demo_today() と同じ）。
export const DEMO_TODAY = '2026-11-09';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function parse(d: string): Date {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function getToday(): string {
  return DEMO_TODAY;
}
export function addDays(d: string, n: number): string {
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}
/** 0=日 … 6=土 */
export function weekday(d: string): number {
  return parse(d).getUTCDay();
}
/** 例：11月9日（月） */
export function formatDay(d: string): string {
  const dt = parse(d);
  return `${dt.getUTCMonth() + 1}月${dt.getUTCDate()}日（${WEEK[dt.getUTCDay()]}）`;
}
