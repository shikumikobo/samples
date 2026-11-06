// デモの「今日」。実際の日付ではなく 2026-11-06 固定（架空のデータの日付に合わせる）。画面で変えられる。
import { DEFAULT_ALERT_SETTINGS } from '@/features/alerts';

const KEY = 'site-manager.today';
export const DEFAULT_TODAY = DEFAULT_ALERT_SETTINGS.today;

export function getToday(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  } catch {}
  return DEFAULT_TODAY;
}

export function setToday(d: string): void {
  try {
    if (d) localStorage.setItem(KEY, d);
    else localStorage.removeItem(KEY);
  } catch {}
}
