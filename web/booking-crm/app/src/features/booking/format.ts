// 表示用の整形と、期限・次の行動の判断（画面に依存しない純粋な関数）。
import { addDays, formatDay } from '@/lib/demo-date';
import type { ErrorCode } from '@/lib/errors';

export function formatYen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

/** 120 → 2時間、150 → 2時間30分、45 → 45分 */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** "2026-11-10T10:30:00+09:00" → "2026-11-10"（日本時間の日付） */
export const dayOf = (iso: string) => iso.slice(0, 10);
/** → "10:30" */
export const timeOf = (iso: string) => iso.slice(11, 16);
export const timeRange = (a: string, b: string) => `${timeOf(a)}〜${timeOf(b)}`;
/** 例：11月10日（火）10:30〜12:00 */
export function formatWhen(startsAt: string, endsAt: string): string {
  return `${formatDay(dayOf(startsAt))} ${timeRange(startsAt, endsAt)}`;
}
/** 11月10日（火） の形の短い日付 */
export const shortDay = (d: string) => formatDay(d);

/** 変更・キャンセルの期限：開始日の前日の終わりまで。今日（デモの今の日付）が開始日以降なら過ぎている（DB の past_deadline と同じ） */
export function isPastDeadline(startsAt: string, nowIso: string): boolean {
  return dayOf(nowIso) >= dayOf(startsAt);
}
/** 期限の日付（開始日の前日）。例：11月9日（月）の終わりまで */
export function deadlineLabel(startsAt: string): string {
  return `${formatDay(addDays(dayOf(startsAt), -1))}の終わりまで`;
}

export interface Slot {
  staff_id: string;
  starts_at: string;
  ends_at: string;
  remaining: number;
  session_id: string | null;
}

/** 日ごとにまとめる（日付の昇順、中は時刻の昇順） */
export function groupByDay(slots: Slot[]): { day: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const d = dayOf(s.starts_at);
    (map.get(d) ?? map.set(d, []).get(d)!).push(s);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, slots: list.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.staff_id.localeCompare(b.staff_id)) }));
}

/** 「おまかせ」のとき、同じ時刻に複数の担当が空いていれば1つにまとめる（先頭の担当）。クラス枠（session_id あり）はそのまま */
export function dedupeAnyStaff(slots: Slot[]): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const s of slots) {
    if (s.session_id) {
      out.push(s);
      continue;
    }
    if (seen.has(s.starts_at)) continue;
    seen.add(s.starts_at);
    out.push(s);
  }
  return out;
}

export interface NextStep {
  text: string;
  href: string | null;
  label: string;
}
/** エラーのあと、次にどうすればよいか。画面の言葉（辞書）は引数で受ける */
export function nextStep(code: ErrorCode | null, w: { service: string }): NextStep {
  switch (code) {
    case 'SLOT_FULL':
    case 'OUT_OF_HOURS':
    case 'TOO_LATE':
    case 'TOO_FAR':
      return { text: '日時を選び直してください。', href: '/book/time/', label: '日時を選び直す' };
    case 'DAY_LIMIT':
      return { text: '別の日を選ぶか、すでにある予定を見直してください。', href: '/book/time/', label: '別の日を選ぶ' };
    case 'TRIAL_USED':
      return { text: `体験以外の${w.service}から選べます。`, href: '/book/', label: `${w.service}を選び直す` };
    case 'DEADLINE_PASSED':
      return { text: '期限を過ぎた変更・キャンセルは、お店に直接ご連絡ください。', href: null, label: '' };
    default:
      return { text: 'お手数ですが、最初からやり直してください。', href: '/book/', label: '最初に戻る' };
  }
}
