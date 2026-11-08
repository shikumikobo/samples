// お客さん側の DB の呼び出し。どれも withRole('customer', id, tx => …) の中で呼ぶ（新規登録だけは下の注を見る）。
import { demoNow, q } from '@/lib/db';
import type { Transaction } from '@electric-sql/pglite';
import type { Slot } from './format';

type Tx = Pick<Transaction, 'query'>;

const JST = (col: string) => `to_char(${col} at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')`;

export interface ServiceRow {
  id: string;
  name: string;
  kind: 'timed' | 'class';
  duration_min: number;
  price: number;
  is_trial: boolean;
  first_time_only: boolean;
  image: string;
  description: string;
}
export interface StaffRow {
  id: string;
  name: string;
  title: string;
}
export interface MineRow {
  id: string;
  service_id: string;
  service_name: string;
  kind: 'timed' | 'class';
  staff_id: string;
  staff_name: string;
  session_id: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  is_trial: boolean;
  status: 'booked' | 'visited' | 'canceled' | 'noshow';
}

export const listServices = (tx: Tx) =>
  q<ServiceRow>(tx, `select id, name, kind, duration_min, price, is_trial, first_time_only, image, description from services where active order by sort, id`);

export const listStaff = (tx: Tx) => q<StaffRow>(tx, `select id, name, title from staff where active order by id`);

export const getService = async (tx: Tx, id: string) =>
  (await q<ServiceRow>(tx, `select id, name, kind, duration_min, price, is_trial, first_time_only, image, description from services where id = $1 and active`, [id]))[0] ?? null;

export const getStaff = async (tx: Tx, id: string) => (await q<StaffRow>(tx, `select id, name, title from staff where id = $1`, [id]))[0] ?? null;

/** 空き枠（デモの今日から予約できる範囲の終わりまで）。時刻は日本時間の文字列 */
export async function loadSlots(tx: Tx, serviceId: string, staffId: string | null): Promise<Slot[]> {
  return q<Slot>(
    tx,
    `select staff_id, ${JST('starts_at')} as starts_at, ${JST('ends_at')} as ends_at, remaining, session_id
       from available_slots($1, $2, demo_today(), demo_today() + setting_int('booking_window_days', 60))
      order by starts_at, staff_id`,
    [serviceId, staffId],
  );
}

export async function reserveSlot(tx: Tx, customerId: string, serviceId: string, slot: Slot): Promise<string> {
  const r = await q<{ id: string }>(tx, `select reserve($1, $2, $3, $4::timestamptz, $5) as id`, [customerId, serviceId, slot.staff_id, slot.starts_at, slot.session_id]);
  return r[0].id;
}
export async function changeSlot(tx: Tx, reservationId: string, slot: Slot): Promise<string> {
  const r = await q<{ id: string }>(tx, `select change_reservation($1, $2, $3::timestamptz, $4) as id`, [reservationId, slot.staff_id, slot.starts_at, slot.session_id]);
  return r[0].id;
}
export async function cancelReservation(tx: Tx, reservationId: string): Promise<string> {
  const r = await q<{ id: string }>(tx, `select cancel_reservation($1) as id`, [reservationId]);
  return r[0].id;
}

/** 自分の予約（RLS で自分のぶんだけ見える）。新しい順 */
export const listMine = (tx: Tx) =>
  q<MineRow>(
    tx,
    `select r.id, r.service_id, sv.name as service_name, sv.kind, r.staff_id, st.name as staff_name, r.session_id,
            ${JST('r.starts_at')} as starts_at, ${JST('r.ends_at')} as ends_at, r.price, r.is_trial, r.status
       from reservations r join services sv on sv.id = r.service_id join staff st on st.id = r.staff_id
      order by r.starts_at desc, r.id`,
  );

export const getNow = (tx: Tx) => demoNow(tx);

/**
 * 初めてのお客さんの登録。
 * 注：customer の役割には customers への insert も登録用の関数も無い（policies.sql）。
 * 見本では、この1か所だけ shop の役割で行を足している（docs/contract.md「変更の依頼」。DB 側に register_customer が付いたら、customer の役割に置き換える）。
 */
export async function registerCustomer(tx: Tx, v: { name: string; kana: string; phone: string; email: string }): Promise<string> {
  const r = await q<{ id: string }>(
    tx,
    `with nxt as (select coalesce(max(substring(id from 2)::int), 0) + 1 as n from customers where id ~ '^c[0-9]+$')
     insert into customers (id, name, kana, phone, email, created_at)
     select 'c' || lpad(n::text, 2, '0'), $1, $2, $3, $4, demo_now() from nxt
     returning id`,
    [v.name.trim(), v.kana.trim(), v.phone.trim(), v.email.trim()],
  );
  return r[0].id;
}
