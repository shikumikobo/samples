// お客さん用の日時の表のためのデータ取得。withRole('customer', id, tx => …) の中で呼ぶ。
// 営業時間・休みは全員が読める。埋まっている時間は、名前を返さない busy_blocks(日) で読む。
import { q } from '@/lib/db';
import type { Transaction } from '@electric-sql/pglite';
import type { GridBusy, GridHours, GridOff } from '@/features/shop/grid';

type Tx = Pick<Transaction, 'query'>;

const TS = (c: string) => `to_char(${c} at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')`;

export interface CustomerGridData {
  notBefore: string;
  lastDay: string;
  hours: GridHours[];
  off: GridOff[];
  busy: GridBusy[];
}

/** 表の1日ぶん：その曜日の営業時間・休み・埋まっている時間・受付できる範囲 */
export async function loadCustomerGrid(tx: Tx, day: string): Promise<CustomerGridData> {
  const [meta] = await q<{ nb: string; ld: string }>(
    tx,
    `select ${TS(`(demo_now() + make_interval(hours => setting_int('min_lead_hours', 2)))`)} as nb,
            to_char(demo_today() + setting_int('booking_window_days', 60), 'YYYY-MM-DD') as ld`,
  );
  const hours = await q<GridHours>(
    tx,
    `select staff_id, to_char(open_time, 'HH24:MI') as open_time, to_char(close_time, 'HH24:MI') as close_time
       from staff_hours where weekday = extract(dow from $1::date)::int`,
    [day],
  );
  const off = await q<GridOff>(tx, `select staff_id, note from staff_off where day = $1::date`, [day]);
  const blocks = await q<{ staff_id: string; starts_at: string; ends_at: string }>(
    tx,
    `select staff_id, ${TS('starts_at')} as starts_at, ${TS('ends_at')} as ends_at from busy_blocks($1::date)`,
    [day],
  );
  // 名前は持たない（お客さんには見せない）
  const busy: GridBusy[] = blocks.map((b, i) => ({ id: `b${i}`, staff_id: b.staff_id, starts_at: b.starts_at, ends_at: b.ends_at, customer_id: '', customer_name: '' }));
  return { notBefore: meta.nb, lastDay: meta.ld, hours, off, busy };
}
