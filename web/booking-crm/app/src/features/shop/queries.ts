// お店側の画面の SQL。必ず withRole('shop', null, ...) の中から呼ぶ（tx を受け取る）。
import { q } from '@/lib/db';
import type { Transaction } from '@electric-sql/pglite';
import type { CustomerRow, HistoryRow, Rsv } from './lib';

export type Tx = Pick<Transaction, 'query'>;
const TS = (c: string) => `to_char(${c} at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')`;

const RSV_SELECT = `
  select r.id, r.customer_id, c.name as customer_name, (c.caution <> '') as caution,
         r.service_id, s.name as service_name, r.staff_id, st.name as staff_name, r.session_id,
         ${TS('r.starts_at')} as starts_at, ${TS('r.ends_at')} as ends_at,
         r.price, r.is_trial, r.status, r.note
  from reservations r
  join customers c on c.id = r.customer_id
  join services s on s.id = r.service_id
  join staff st on st.id = r.staff_id`;

export async function loadToday(tx: Tx): Promise<string> {
  return (await q<{ d: string }>(tx, `select to_char(demo_today(), 'YYYY-MM-DD') as d`))[0].d;
}

export async function loadReservations(tx: Tx, from: string, to: string): Promise<Rsv[]> {
  return q<Rsv>(tx, `${RSV_SELECT} where local_day(r.starts_at) between $1::date and $2::date order by r.starts_at, r.id`, [from, to]);
}

export interface StaffRow {
  id: string;
  name: string;
  title: string;
}
export async function loadStaff(tx: Tx): Promise<StaffRow[]> {
  return q<StaffRow>(tx, `select id, name, title from staff where active order by id`);
}

export interface ServiceRow {
  id: string;
  name: string;
  kind: 'timed' | 'class';
  duration_min: number;
  price: number;
  is_trial: boolean;
  first_time_only: boolean;
  return_days: number | null;
  active: boolean;
}
export async function loadServices(tx: Tx, onlyActive = false): Promise<ServiceRow[]> {
  return q<ServiceRow>(
    tx,
    `select id, name, kind, duration_min, price, is_trial, first_time_only, return_days, active from services ${onlyActive ? 'where active' : ''} order by sort, id`,
  );
}

export interface SessionRow {
  id: string;
  service_id: string;
  service_name: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
}
/** 教室の枠と、キャンセル以外の人数 */
export async function loadSessions(tx: Tx, from: string, to: string): Promise<SessionRow[]> {
  return q<SessionRow>(
    tx,
    `select cs.id, cs.service_id, s.name as service_name, cs.staff_id, ${TS('cs.starts_at')} as starts_at, ${TS('cs.ends_at')} as ends_at, cs.capacity,
            (select count(*)::int from reservations r where r.session_id = cs.id and r.status <> 'canceled') as booked
     from class_sessions cs join services s on s.id = cs.service_id
     where local_day(cs.starts_at) between $1::date and $2::date order by cs.starts_at, cs.id`,
    [from, to],
  );
}

export interface OffRow {
  staff_id: string;
  day: string;
  note: string;
}
export async function loadOff(tx: Tx, from: string, to: string | null): Promise<OffRow[]> {
  return q<OffRow>(
    tx,
    `select staff_id, to_char(day, 'YYYY-MM-DD') as day, note from staff_off where day >= $1::date and ($2::date is null or day <= $2::date) order by day, staff_id`,
    [from, to],
  );
}

export interface HoursRow {
  staff_id: string;
  weekday: number;
  open_time: string;
  close_time: string;
}
export async function loadHours(tx: Tx): Promise<HoursRow[]> {
  return q<HoursRow>(
    tx,
    `select staff_id, weekday, to_char(open_time, 'HH24:MI') as open_time, to_char(close_time, 'HH24:MI') as close_time from staff_hours order by staff_id, weekday`,
  );
}

export interface Slot {
  staff_id: string;
  starts_at: string;
  ends_at: string;
  remaining: number;
  session_id: string | null;
}
export async function loadSlots(tx: Tx, serviceId: string, staffId: string | null, day: string): Promise<Slot[]> {
  return q<Slot>(
    tx,
    `select staff_id, ${TS('starts_at')} as starts_at, ${TS('ends_at')} as ends_at, remaining, session_id
     from available_slots($1, $2, $3::date, $3::date) order by starts_at, staff_id`,
    [serviceId, staffId, day],
  );
}

export async function loadCustomers(tx: Tx): Promise<CustomerRow[]> {
  return q<CustomerRow>(
    tx,
    `select c.id, c.name, c.kana, c.phone, (c.caution <> '') as has_caution,
            (count(r.id) filter (where r.status = 'visited'))::int as visits,
            to_char(max(local_day(r.starts_at)) filter (where r.status = 'visited'), 'YYYY-MM-DD') as last_visit,
            coalesce(bool_or(r.is_trial and r.status in ('booked', 'visited')), false) as had_trial,
            coalesce(bool_or(not r.is_trial and r.status in ('booked', 'visited')), false) as has_regular
     from customers c left join reservations r on r.customer_id = c.id
     where c.active group by c.id order by c.kana, c.id`,
  );
}

export interface CustomerDetail {
  id: string;
  name: string;
  kana: string;
  phone: string;
  email: string;
  note: string;
  caution: string;
}
export async function loadCustomer(tx: Tx, id: string): Promise<CustomerDetail | null> {
  const r = await q<CustomerDetail>(tx, `select id, name, kana, phone, email, note, caution from customers where id = $1`, [id]);
  return r[0] ?? null;
}
export async function saveKarte(tx: Tx, id: string, note: string, caution: string): Promise<void> {
  await tx.query(`update customers set note = $2, caution = $3 where id = $1`, [id, note, caution]);
}
export async function loadCustomerReservations(tx: Tx, id: string): Promise<Rsv[]> {
  return q<Rsv>(tx, `${RSV_SELECT} where r.customer_id = $1 order by r.starts_at desc, r.id`, [id]);
}
export async function loadHistory(tx: Tx, customerId: string): Promise<HistoryRow[]> {
  return q<HistoryRow>(
    tx,
    `select h.id, ${TS('h.at')} as at, h.actor, h.action, h.reservation_id, h.before, h.after
     from history h where h.reservation_id in (select id from reservations where customer_id = $1)
     order by h.at desc, h.id desc`,
    [customerId],
  );
}

export interface DueRow {
  customer_id: string;
  customer_name: string;
  phone: string;
  last_visit: string;
  service_id: string;
  service_name: string;
  due_since_days: number;
}
export async function loadDue(tx: Tx, asOf: string): Promise<DueRow[]> {
  return q<DueRow>(
    tx,
    `select d.customer_id, c.name as customer_name, c.phone, to_char(d.last_visit, 'YYYY-MM-DD') as last_visit, d.service_id, s.name as service_name, d.due_since_days
     from due_for_return($1::date) d join customers c on c.id = d.customer_id join services s on s.id = d.service_id
     order by d.due_since_days desc, d.customer_id`,
    [asOf],
  );
}

// ── 書き込み（予約は DB の関数だけ） ──
export const markVisited = (tx: Tx, id: string) => tx.query('select mark_visited($1)', [id]);
export const markNoshow = (tx: Tx, id: string) => tx.query('select mark_noshow($1)', [id]);
export const cancelReservation = (tx: Tx, id: string) => tx.query('select cancel_reservation($1)', [id]);
/** 保存後の修正：状態をどれからどれへも直す（お店だけ）。note を渡すと、メモも同時に書く（キャンセルの理由）。canceled から戻すときは、枠が空いていないと SLOT_TAKEN */
export const setStatus = (tx: Tx, id: string, status: 'booked' | 'visited' | 'noshow' | 'canceled', note: string | null = null) =>
  tx.query('select set_reservation_status($1, $2, $3)', [id, status, note]);
/** 予約のお店のメモを書く（お客さんには見えない）。履歴に残る */
export const setNote = (tx: Tx, id: string, note: string) => tx.query('select set_reservation_note($1, $2)', [id, note]);
export async function reserveFor(tx: Tx, customerId: string, serviceId: string, slot: Pick<Slot, 'staff_id' | 'starts_at' | 'session_id'>): Promise<string> {
  const r = await q<{ id: string }>(tx, 'select reserve($1, $2, $3, $4::timestamptz, $5) as id', [customerId, serviceId, slot.staff_id, slot.starts_at, slot.session_id]);
  return r[0].id;
}
export async function changeTo(tx: Tx, id: string, slot: Pick<Slot, 'staff_id' | 'starts_at' | 'session_id'>): Promise<string> {
  const r = await q<{ id: string }>(tx, 'select change_reservation($1, $2, $3::timestamptz, $4) as id', [id, slot.staff_id, slot.starts_at, slot.session_id]);
  return r[0].id;
}

// ── 設定 ──
export async function saveService(tx: Tx, s: ServiceRow): Promise<void> {
  await tx.query(
    `update services set name = $2, price = $3, duration_min = $4, is_trial = $5, first_time_only = $6, return_days = $7, active = $8 where id = $1`,
    [s.id, s.name, s.price, s.duration_min, s.is_trial, s.first_time_only, s.return_days, s.active],
  );
}
export async function saveHours(tx: Tx, staffId: string, rows: { weekday: number; open_time: string; close_time: string }[]): Promise<void> {
  await tx.query('delete from staff_hours where staff_id = $1', [staffId]);
  for (const r of rows) {
    await tx.query('insert into staff_hours (staff_id, weekday, open_time, close_time) values ($1, $2, $3::time, $4::time)', [staffId, r.weekday, r.open_time, r.close_time]);
  }
}
export async function addOff(tx: Tx, staffId: string, day: string, note: string): Promise<void> {
  await tx.query(`insert into staff_off (staff_id, day, note) values ($1, $2::date, $3) on conflict (staff_id, day) do update set note = excluded.note`, [staffId, day, note]);
}
export async function removeOff(tx: Tx, staffId: string, day: string): Promise<void> {
  await tx.query('delete from staff_off where staff_id = $1 and day = $2::date', [staffId, day]);
}
