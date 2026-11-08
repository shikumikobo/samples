// お店側の画面の、画面に依存しない計算（日付・集計・絞り込み・文面）。
import type { Mode, Words } from '@/lib/words';
import { addDays, weekday } from '@/lib/demo-date';

/** DB から取り出した予約の行（時刻は '2026-11-09T10:00:00+09:00' の文字列） */
export interface Rsv {
  id: string;
  customer_id: string;
  customer_name: string;
  caution: boolean;
  service_id: string;
  service_name: string;
  staff_id: string;
  staff_name: string;
  session_id: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  is_trial: boolean;
  status: 'booked' | 'visited' | 'canceled' | 'noshow';
  note?: string; // お店のメモ（キャンセルの理由など）
}

export const hm = (s: string) => s.slice(11, 16);
export const dayOf = (s: string) => s.slice(0, 10);
export const toTs = (day: string, time: string) => `${day}T${time}:00+09:00`;
/** 11/9 */
export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
/** 11/9 10:00 */
export const mdhm = (s: string) => `${md(s)} ${hm(s)}`;
export const range = (a: string, b: string) => `${hm(a)}〜${hm(b)}`;
export const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

export function byTime<T extends { starts_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
}

export function groupBy<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const a = m.get(k);
    if (a) a.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** その日を含む週の月曜日 */
export function weekStart(d: string): string {
  const wd = weekday(d); // 0=日
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}
export function weekDays(d: string): string[] {
  const s = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export interface DayCount {
  total: number;
  booked: number;
  visited: number;
  noshow: number;
  trial: number;
}
/** キャンセルを除いた件数。体験は is_trial の件数 */
export function countDay(list: Pick<Rsv, 'status' | 'is_trial'>[]): DayCount {
  const live = list.filter((r) => r.status !== 'canceled');
  return {
    total: live.length,
    booked: live.filter((r) => r.status === 'booked').length,
    visited: live.filter((r) => r.status === 'visited').length,
    noshow: live.filter((r) => r.status === 'noshow').length,
    trial: live.filter((r) => r.is_trial).length,
  };
}

// ── お客さんの絞り込み ──
export interface CustomerRow {
  id: string;
  name: string;
  kana: string;
  phone: string;
  has_caution: boolean;
  visits: number;
  last_visit: string | null;
  had_trial: boolean; // 体験の予約（キャンセル・無断欠席を除く）がある
  has_regular: boolean; // 体験ではない予約（キャンセル・無断欠席を除く）がある
}
export type TrialKind = 'trial_only' | 'converted' | 'none';
/** 体験のみ＝体験はあるが通常の予約がない。体験から通常に来た＝体験も通常の予約もある */
export function trialKind(c: Pick<CustomerRow, 'had_trial' | 'has_regular'>): TrialKind {
  if (!c.had_trial) return 'none';
  return c.has_regular ? 'converted' : 'trial_only';
}
export type CustomerFilter = 'all' | 'trial_only' | 'converted';

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-ー－]/g, '');
export function filterCustomers(list: CustomerRow[], q: string, f: CustomerFilter): CustomerRow[] {
  const nq = norm(q);
  return list.filter((c) => {
    if (f !== 'all' && trialKind(c) !== f) return false;
    if (!nq) return true;
    return norm(c.name).includes(nq) || norm(c.kana).includes(nq) || norm(c.phone).includes(nq);
  });
}

// ── 連絡の文（コピーするだけ。送らない） ──
export interface ContactInput {
  name: string;
  serviceName: string;
  lastVisit: string; // YYYY-MM-DD
  shopName: string;
}
export function buildContactMessage(mode: Mode, c: ContactInput): string {
  const last = `${Number(c.lastVisit.slice(5, 7))}月${Number(c.lastVisit.slice(8, 10))}日`;
  if (mode === 'class') {
    return [
      `${c.name}さん`,
      '',
      `${c.shopName}です。いつもありがとうございます。`,
      `${last}にご出席いただいた「${c.serviceName}」から、少し日があきましたね。`,
      '次回のクラスの日程が出ています。ご都合のよい日があれば、お申込みをお待ちしています。',
      '',
      `${c.shopName}`,
    ].join('\n');
  }
  return [
    `${c.name}さま`,
    '',
    `${c.shopName}です。いつもありがとうございます。`,
    `${last}にご来店いただいた「${c.serviceName}」から、そろそろお手入れの時期です。`,
    'ご都合のよい日があれば、ご予約をお待ちしています。',
    '',
    `${c.shopName}`,
  ].join('\n');
}

// ── 変更の履歴の表示 ──
export interface HistoryRow {
  id: number | string;
  at: string;
  actor: string;
  action: string;
  reservation_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export function describeHistory(
  h: HistoryRow,
  w: Pick<Words, 'visited' | 'noshow' | 'customer' | 'booked'>,
  rsvWord: string,
): { when: string; who: string; what: string; detail: string } {
  const label: Record<string, string> = {
    create: `${rsvWord}を作成`,
    change: `${rsvWord}の日時・担当を変更`,
    cancel: `${rsvWord}をキャンセル`,
    visit: w.visited,
    noshow: w.noshow,
    restore: `${w.booked}に戻した`,
    update: `${rsvWord}を更新`,
  };
  // トリガーが書いた履歴の日時は UTC（+00:00）の文字列のことがある。日本時間にそろえてから出す
  const jst = (v: string) => (/\+09:00$/.test(v) ? v : new Date(new Date(v).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19) + '+09:00');
  const t = (x: Record<string, unknown> | null) => (x && typeof x.starts_at === 'string' ? mdhm(jst(x.starts_at)) : '');
  const noteOf = (x: Record<string, unknown> | null) => (x && typeof x.note === 'string' ? x.note : '');
  const noteChanged = noteOf(h.before) !== noteOf(h.after);
  let what = label[h.action] ?? h.action;
  let detail = h.action === 'change' ? `${t(h.before)} → ${t(h.after)}` : t(h.after ?? h.before);
  if (h.action === 'update' && noteChanged) {
    what = 'メモを更新';
    detail = noteOf(h.after) ? `「${noteOf(h.after)}」` : 'メモを消した';
  } else if (noteChanged && noteOf(h.after)) {
    detail = `${detail}　メモ：「${noteOf(h.after)}」`;
  }
  return {
    when: mdhm(h.at),
    who: h.actor === 'shop' ? 'お店' : `${w.customer}本人`,
    what,
    detail,
  };
}

/** 営業時間の入力の確認。問題があれば日本語の文を返す */
export function checkHours(open: string, close: string): string | null {
  if (!open || !close) return '開始と終了の時刻を入れてください。';
  if (open >= close) return '終了は開始より後の時刻にしてください。';
  return null;
}
