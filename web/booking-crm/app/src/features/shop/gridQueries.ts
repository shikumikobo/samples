// 空き表のためのデータ取得。必ず withRole('shop', null, ...) の中から呼ぶ。
import { q } from '@/lib/db';
import type { GridBusy, GridHours, GridOff, GridStaff } from './grid';
import type { Tx } from './queries';

const TS = (c: string) => `to_char(${c} at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')`;

export interface GridData {
  today: string;
  notBefore: string;
  lastDay: string;
  staff: GridStaff[];
  hours: GridHours[];
  off: GridOff[];
  busy: GridBusy[];
}

/** 表の1日ぶん：担当・その曜日の営業時間・休み・サロン型の予約（キャンセル以外）・受付できる範囲 */
export async function loadGrid(tx: Tx, day: string): Promise<GridData> {
  const [meta] = await q<{ today: string; nb: string; ld: string }>(
    tx,
    `select to_char(demo_today(), 'YYYY-MM-DD') as today,
            ${TS(`(demo_now() + make_interval(hours => setting_int('min_lead_hours', 2)))`)} as nb,
            to_char(demo_today() + setting_int('booking_window_days', 60), 'YYYY-MM-DD') as ld`,
  );
  const staff = await q<GridStaff>(tx, `select id, name, title from staff where active order by id`);
  const hours = await q<GridHours>(
    tx,
    `select staff_id, to_char(open_time, 'HH24:MI') as open_time, to_char(close_time, 'HH24:MI') as close_time
       from staff_hours where weekday = extract(dow from $1::date)::int`,
    [day],
  );
  const off = await q<GridOff>(tx, `select staff_id, note from staff_off where day = $1::date`, [day]);
  const busy = await q<GridBusy>(
    tx,
    `select r.id, r.staff_id, ${TS('r.starts_at')} as starts_at, ${TS('r.ends_at')} as ends_at, r.customer_id, c.name as customer_name
       from reservations r join customers c on c.id = r.customer_id
      where r.session_id is null and r.status <> 'canceled' and local_day(r.starts_at) = $1::date
      order by r.starts_at, r.id`,
    [day],
  );
  return { today: meta.today, notBefore: meta.nb, lastDay: meta.ld, staff, hours, off, busy };
}
