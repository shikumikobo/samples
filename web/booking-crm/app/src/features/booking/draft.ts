// 予約の途中の選び方を、画面の間で持ち回す（このタブの中だけ。sessionStorage）。
import type { Slot } from './format';

export interface Draft {
  serviceId: string | null;
  staffId: string | null; // null = おまかせ
  slot: Slot | null;
}
const KEY = 'booking-crm.draft';
const LAST = 'booking-crm.last-reservation';
export const emptyDraft: Draft = { serviceId: null, staffId: null, slot: null };

function get(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {}
}
export function loadDraft(): Draft {
  try {
    const d = JSON.parse(get(KEY) ?? 'null');
    if (d && typeof d === 'object') return { ...emptyDraft, ...d };
  } catch {}
  return { ...emptyDraft };
}
export function saveDraft(d: Draft) {
  set(KEY, JSON.stringify(d));
}
export function clearDraft() {
  set(KEY, null);
}
export const loadLastReservation = () => get(LAST);
export const saveLastReservation = (id: string | null) => set(LAST, id);

// 別の画面に移ったあとに1回だけ出す案内（sessionStorage）。例：はじめての方が /my/ を開いて予約の画面に戻されたとき
const NOTICE = 'booking-crm.notice';
export const saveNotice = (t: string) => set(NOTICE, t);
export function takeNotice(): string | null {
  const t = get(NOTICE);
  if (t) set(NOTICE, null);
  return t;
}
