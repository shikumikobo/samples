// お店側の画面の SQL。必ず withRole('shop', null, ...) の中から呼ぶ（tx を受け取る）。
import { q } from '@/lib/db';
import type { Transaction } from '@electric-sql/pglite';
import { occurrences, checkRepeat, type CustomerRow, type HistoryRow, type Repeat, type Rsv } from './lib';

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
  image: string | null;
  active: boolean;
}
export async function loadServices(tx: Tx, onlyActive = false): Promise<ServiceRow[]> {
  return q<ServiceRow>(
    tx,
    `select id, name, kind, duration_min, price, is_trial, first_time_only, return_days, image, active from services ${onlyActive ? 'where active' : ''} order by sort, id`,
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
  series_id: string | null;
}
/** 教室の枠と、キャンセル以外の人数 */
export async function loadSessions(tx: Tx, from: string, to: string): Promise<SessionRow[]> {
  return q<SessionRow>(
    tx,
    `select cs.id, cs.service_id, s.name as service_name, cs.staff_id, ${TS('cs.starts_at')} as starts_at, ${TS('cs.ends_at')} as ends_at, cs.capacity, cs.series_id,
            (select count(*)::int from reservations r where r.session_id = cs.id and r.status <> 'canceled') as booked
     from class_sessions cs join services s on s.id = cs.service_id
     where local_day(cs.starts_at) between $1::date and $2::date order by cs.starts_at, cs.id`,
    [from, to],
  );
}

/** 日付（YYYY-MM-DD）に日数を足す */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export interface SessionInput {
  service_id: string;
  staff_id: string;
  day: string;
  start: string;
  end: string;
  capacity: number;
}
const at = (day: string, hm: string) => `${day}T${hm}:00+09:00`;
/** 同じ担当の別の枠と時間が重なる・担当の休みの日、のどちらかなら true（exceptId の枠は除く） */
async function sessionBlocked(tx: Tx, x: SessionInput, exceptId: string | null): Promise<boolean> {
  const o = await tx.query<{ n: number }>(
    `select count(*)::int as n from class_sessions where staff_id = $1 and starts_at < $3::timestamptz and ends_at > $2::timestamptz and id <> coalesce($4, '')`,
    [x.staff_id, at(x.day, x.start), at(x.day, x.end), exceptId],
  );
  if ((o.rows[0]?.n ?? 0) > 0) return true;
  const f = await tx.query<{ n: number }>('select count(*)::int as n from staff_off where staff_id = $1 and day = $2::date', [x.staff_id, x.day]);
  return (f.rows[0]?.n ?? 0) > 0;
}
let idSeq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export interface SeriesRow {
  id: string;
  service_id: string;
  service_name: string;
  staff_id: string;
  repeat: 'weekly' | 'monthly';
  start_day: string;
  until_day: string;
  start_time: string;
  end_time: string;
  capacity: number;
}
/** 教室のくり返し（期限が今日以降のもの） */
export async function loadSeries(tx: Tx, today: string): Promise<SeriesRow[]> {
  return q<SeriesRow>(
    tx,
    `select ss.id, ss.service_id, s.name as service_name, ss.staff_id, ss.repeat,
            to_char(ss.start_day, 'YYYY-MM-DD') as start_day, to_char(ss.until_day, 'YYYY-MM-DD') as until_day,
            to_char(ss.start_time, 'HH24:MI') as start_time, to_char(ss.end_time, 'HH24:MI') as end_time, ss.capacity
     from session_series ss join services s on s.id = ss.service_id
     where ss.until_day >= $1::date order by ss.start_day, ss.id`,
    [today],
  );
}

async function insertSession(tx: Tx, x: SessionInput, seriesId: string | null): Promise<void> {
  await tx.query(
    `insert into class_sessions (id, service_id, staff_id, starts_at, ends_at, capacity, series_id) values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7)`,
    [newId('cs'), x.service_id, x.staff_id, at(x.day, x.start), at(x.day, x.end), x.capacity, seriesId],
  );
}

/**
 * 開催日を足す。repeat が 'none' なら1回だけ（日にち限定）。
 * 'weekly'（毎週）・'monthly'（毎月）なら、until（期限）まで。くり返しの決まりも残す。重なる日・休みの日は飛ばす。
 * エラーなら error に文。
 */
export async function addSessions(tx: Tx, x: SessionInput, repeat: Repeat, until: string): Promise<{ added: number; skipped: number; error?: string }> {
  const bad = checkRepeat(repeat, x.day, until);
  if (bad) return { added: 0, skipped: 0, error: bad };
  const days = occurrences(repeat, x.day, until);
  let seriesId: string | null = null;
  if (repeat !== 'none') {
    seriesId = newId('sr');
    await tx.query(
      `insert into session_series (id, service_id, staff_id, repeat, start_day, until_day, start_time, end_time, capacity) values ($1, $2, $3, $4, $5::date, $6::date, $7::time, $8::time, $9)`,
      [seriesId, x.service_id, x.staff_id, repeat, x.day, until, x.start, x.end, x.capacity],
    );
  }
  let added = 0;
  let skipped = 0;
  for (const day of days) {
    const one = { ...x, day };
    if (await sessionBlocked(tx, one, null)) {
      skipped++;
      continue;
    }
    await insertSession(tx, one, seriesId);
    added++;
  }
  if (added === 0 && seriesId) await tx.query('delete from session_series where id = $1', [seriesId]);
  return { added, skipped };
}

/** くり返しの期限を変える。延ばすと足し、縮めると、期限のあとの日（今日以降）を消す（予約の記録がある日は、日にち限定として残す） */
export async function changeSeriesUntil(tx: Tx, sr: SeriesRow, until: string, today: string): Promise<{ added: number; skipped: number; removed: number; kept: number; error?: string }> {
  const none = { added: 0, skipped: 0, removed: 0, kept: 0 };
  const bad = checkRepeat(sr.repeat, sr.start_day, until);
  if (bad) return { ...none, error: bad };
  let added = 0;
  let skipped = 0;
  let removed = 0;
  let kept = 0;
  if (until > sr.until_day) {
    for (const day of occurrences(sr.repeat, sr.start_day, until).filter((d) => d > sr.until_day)) {
      const one = { service_id: sr.service_id, staff_id: sr.staff_id, day, start: sr.start_time, end: sr.end_time, capacity: sr.capacity };
      if (await sessionBlocked(tx, one, null)) {
        skipped++;
        continue;
      }
      await insertSession(tx, one, sr.id);
      added++;
    }
  } else if (until < sr.until_day) {
    const r = await releaseSessions(tx, sr.id, until < today ? today : addDays(until, 1));
    removed = r.removed;
    kept = r.kept;
  }
  await tx.query('update session_series set until_day = $2::date where id = $1', [sr.id, until]);
  return { added, skipped, removed, kept };
}

/** くり返しの、from 以降の日を消す。予約の記録がある日は消さず、くり返しから外して残す */
async function releaseSessions(tx: Tx, seriesId: string, from: string): Promise<{ removed: number; kept: number }> {
  const del = await tx.query(
    `delete from class_sessions cs where cs.series_id = $1 and local_day(cs.starts_at) >= $2::date
       and not exists (select 1 from reservations r where r.session_id = cs.id) returning cs.id`,
    [seriesId, from],
  );
  const keep = await tx.query(
    `update class_sessions set series_id = null where series_id = $1 and local_day(starts_at) >= $2::date returning id`,
    [seriesId, from],
  );
  return { removed: del.rows.length, kept: keep.rows.length };
}

/** くり返しをやめる：今日以降の日を消す（予約の記録がある日は、日にち限定として残す）。過去の日は、日にち限定として残る */
export async function removeSeries(tx: Tx, seriesId: string, today: string): Promise<{ removed: number; kept: number }> {
  const r = await releaseSessions(tx, seriesId, today);
  await tx.query('delete from session_series where id = $1', [seriesId]);
  return r;
}
/** 開催日を直す。エラーなら文、問題なければ null */
export async function updateSession(tx: Tx, id: string, x: SessionInput, booked: number): Promise<string | null> {
  if (x.capacity < booked) return `すでに${booked}名が申し込んでいるので、定員は${booked}名より少なくできません。`;
  if (await sessionBlocked(tx, x, id)) return '同じ担当の別の枠と時間が重なるか、担当の休みの日です。';
  await tx.query(
    `update class_sessions set staff_id = $2, starts_at = $3::timestamptz, ends_at = $4::timestamptz, capacity = $5 where id = $1`,
    [id, x.staff_id, at(x.day, x.start), at(x.day, x.end), x.capacity],
  );
  return null;
}
/** 開催日を消す。申込み（キャンセル以外）が入っていれば消せない */
export async function removeSession(tx: Tx, id: string): Promise<string | null> {
  const r = await tx.query<{ n: number }>('select count(*)::int as n from reservations where session_id = $1', [id]);
  const n = r.rows[0]?.n ?? 0;
  if (n > 0) return `この開催日には予約の記録が${n}件あるので消せません（予約の履歴を残すためです）。`;
  await tx.query('delete from class_sessions where id = $1', [id]);
  return null;
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
    `update services set name = $2, price = $3, duration_min = $4, is_trial = $5, first_time_only = $6, return_days = $7, active = $8, image = $9 where id = $1`,
    [s.id, s.name, s.price, s.duration_min, s.is_trial, s.first_time_only, s.return_days, s.active, s.image],
  );
}
/** メニュー（コース）を足す。並びは最後。画像は同梱の名前か、data: の画像 */
export async function addService(tx: Tx, x: { name: string; kind: 'timed' | 'class'; price: number; duration_min: number; image: string | null }): Promise<void> {
  const id = `svc_${Date.now().toString(36)}`;
  await tx.query(
    `insert into services (id, name, kind, duration_min, price, image, sort) values ($1, $2, $3, $4, $5, $6, (select coalesce(max(sort), 0) + 1 from services))`,
    [id, x.name, x.kind, x.duration_min, x.price, x.image],
  );
}
/** 予約や履歴のあるメニューの数（0 なら消せる） */
export async function serviceUseCount(tx: Tx, id: string): Promise<number> {
  const r = await tx.query<{ n: number }>('select count(*)::int as n from reservations where service_id = $1', [id]);
  return r.rows[0]?.n ?? 0;
}
export async function removeService(tx: Tx, id: string): Promise<void> {
  await tx.query('delete from class_sessions where service_id = $1', [id]);
  await tx.query('delete from session_series where service_id = $1', [id]);
  await tx.query('delete from services where id = $1', [id]);
}
/** 担当（講師）の名前・肩書きを直す */
export async function saveStaff(tx: Tx, id: string, name: string, title: string): Promise<void> {
  await tx.query('update staff set name = $2, title = $3 where id = $1', [id, name, title]);
}
/** 担当を足す。営業時間は月〜金 10:00〜18:00 から始める（あとで直せる） */
export async function addStaff(tx: Tx, name: string, title: string): Promise<void> {
  const id = `st_${Date.now().toString(36)}`;
  await tx.query('insert into staff (id, name, title) values ($1, $2, $3)', [id, name, title]);
  for (const wd of [1, 2, 3, 4, 5]) {
    await tx.query(`insert into staff_hours (staff_id, weekday, open_time, close_time) values ($1, $2, '10:00', '18:00')`, [id, wd]);
  }
}
/** 担当を外す：予約の画面と表から消える。入っている予約と履歴は、そのまま残る */
export async function deactivateStaff(tx: Tx, id: string): Promise<void> {
  await tx.query('update staff set active = false where id = $1', [id]);
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
