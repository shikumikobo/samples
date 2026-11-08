// 空き表（縦＝時間 15分刻み、横＝担当者）の、画面に依存しない計算。
// 行は「その時刻から15分」を表す。セルの状態：休み／営業時間外／予約あり／受付できない（直前・先すぎ）／空き。
import { dayOf, hm, toTs } from './lib';

export const STEP = 15;

export type CellState = 'free' | 'busy' | 'closed' | 'off' | 'late';

export interface GridStaff {
  id: string;
  name: string;
  title: string;
}
/** その日の曜日の営業時間（'HH:MM'） */
export interface GridHours {
  staff_id: string;
  open_time: string;
  close_time: string;
}
export interface GridOff {
  staff_id: string;
  note: string;
}
/** その日の、サロン型（枠ではない）の予約。キャンセルを除く */
export interface GridBusy {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  customer_id: string;
  customer_name: string;
}
export interface GridInput {
  day: string; // YYYY-MM-DD
  staff: GridStaff[];
  hours: GridHours[];
  off: GridOff[];
  busy: GridBusy[];
  /** これより前は受付できない（デモの今 ＋ 直前の時間）。'2026-11-09T11:00:00+09:00' の形 */
  notBefore: string;
  /** 受付できる最後の日 */
  lastDay: string;
  /** 予約の変更のとき、自分自身の予約は埋まりとして数えない */
  excludeId?: string | null;
}

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** 所要時間ぶんのセル数（15分に満たない端数は切り上げ） */
export const cellsFor = (durationMin: number) => Math.max(1, Math.ceil(durationMin / STEP));

/** 表に出す時間の範囲：休みでない担当の営業時間の、いちばん早い開始〜いちばん遅い終了（15分に丸める）。誰も開いていなければ null */
export function gridWindow(inp: Pick<GridInput, 'staff' | 'hours' | 'off'>): { from: number; to: number } | null {
  const offIds = new Set(inp.off.map((o) => o.staff_id));
  const open = inp.hours.filter((h) => !offIds.has(h.staff_id) && inp.staff.some((s) => s.id === h.staff_id));
  if (open.length === 0) return null;
  const from = Math.min(...open.map((h) => toMin(h.open_time)));
  const to = Math.max(...open.map((h) => toMin(h.close_time)));
  return { from: Math.floor(from / STEP) * STEP, to: Math.ceil(to / STEP) * STEP };
}

/** 行の開始時刻（分）の並び */
export function gridRows(win: { from: number; to: number } | null): number[] {
  if (!win) return [];
  const rows: number[] = [];
  for (let m = win.from; m < win.to; m += STEP) rows.push(m);
  return rows;
}

/** その担当・その15分に重なる予約（自分自身の予約は除く） */
export function busyAt(inp: GridInput, staffId: string, minute: number): GridBusy | undefined {
  return inp.busy.find(
    (b) =>
      b.staff_id === staffId &&
      b.id !== inp.excludeId &&
      dayOf(b.starts_at) === inp.day &&
      toMin(hm(b.starts_at)) < minute + STEP &&
      toMin(hm(b.ends_at)) > minute,
  );
}

/** 予約の最初の行か（名前はここだけに出す）。表の最初の行より前から始まる予約は、表の最初の行を最初とみなす */
export function isBusyStart(b: GridBusy, minute: number, firstRow: number): boolean {
  const s = toMin(hm(b.starts_at));
  return (s >= minute && s < minute + STEP) || (minute === firstRow && s < firstRow);
}

export function cellState(inp: GridInput, staffId: string, minute: number): CellState {
  if (inp.off.some((o) => o.staff_id === staffId)) return 'off';
  const h = inp.hours.find((x) => x.staff_id === staffId);
  if (!h || minute < toMin(h.open_time) || minute + STEP > toMin(h.close_time)) return 'closed';
  if (busyAt(inp, staffId, minute)) return 'busy';
  if (inp.day > inp.lastDay || toTs(inp.day, minToHm(minute)) < inp.notBefore) return 'late';
  return 'free';
}

export const STATE_REASON: Record<CellState, string> = {
  free: '',
  busy: '予約が入っている時間にかかります',
  closed: '営業時間の外にかかります',
  off: '休みの日です',
  late: '直前、または先すぎるため、受付できない時間にかかります',
};

export type Fit = { ok: true } | { ok: false; reason: string };

/** 開始のセルから所要時間ぶん、すべて空きか。だめなら、理由を返す */
export function fits(inp: GridInput, staffId: string, startMin: number, durationMin: number): Fit {
  const n = cellsFor(durationMin);
  for (let i = 0; i < n; i++) {
    const m = startMin + i * STEP;
    const st = cellState(inp, staffId, m);
    if (st !== 'free') return { ok: false, reason: `${minToHm(startMin)}から${durationMin}分は選べません。${minToHm(m)}の時間で、${STATE_REASON[st]}。` };
  }
  return { ok: true };
}

export interface Selection {
  staffId: string;
  start: number; // 分
}
export function selectionLabel(sel: Selection, durationMin: number): string {
  return `${minToHm(sel.start)}〜${minToHm(sel.start + durationMin)}`;
}
/** セルが、選んだ範囲の中か（所要時間ぶんの連続したセル） */
export function inSelection(sel: Selection | null, staffId: string, minute: number, durationMin: number): boolean {
  return !!sel && sel.staffId === staffId && minute >= sel.start && minute < sel.start + cellsFor(durationMin) * STEP;
}
