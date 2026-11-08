// ブラウザの中の DB（PGlite）。docs/contract.md の約束：getDb()・withRole(role, customerId, fn)・resetDemo(mode?)。
// 画面は必ず withRole の中で SQL を実行する（RLS が効く）。
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { SQL_FILES } from './sql.generated';
import type { Mode } from '../words';
import type { Role } from './types';

export * from './types';

/** RLS・列の権限を受ける DB の役割（policies.sql が作る） */
export const DB_ROLES = { customer: 'app_customer', shop: 'app_shop' } as const;
export const DB_NAME = 'idb://booking-crm';
export const MODE_KEY = 'booking-crm.mode';
export const DEFAULT_MODE: Mode = 'salon';
/** 定義（db/*.sql）の版。上げると、ブラウザに残っている古い DB を、最初のデータで作り直す（2：教室のくり返し） */
export const SCHEMA_VERSION = 2;

export type Db = PGlite;
let dbPromise: Promise<Db> | null = null;

export function getStoredMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'salon' || v === 'class') return v;
  } catch {}
  return DEFAULT_MODE;
}
function storeMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
}

/** DB を作り、定義（db/*.sql）を流す。dataDir を渡さなければ、ブラウザなら IndexedDB に保存する */
export async function createDb(mode: Mode = getStoredMode(), dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
  const dir = dataDir ?? (typeof indexedDB !== 'undefined' ? DB_NAME : undefined);
  const opts = { extensions: { btree_gist } };
  const db = dir ? new PGlite(dir, opts) : new PGlite(opts);
  await db.waitReady;
  // 準備が最後まで終わったときだけ付く印（_demo_ready。中身はモード）で見分ける。途中で閉じても、モードが違っても、作り直す
  const ready = await db.query<{ t: string | null }>(`select to_regclass('public._demo_ready')::text as t`);
  let current: string | null = null;
  if (ready.rows[0]?.t) {
    try {
      const r = (await db.query<{ mode: string; v: number }>('select mode, v from public._demo_ready limit 1')).rows[0];
      if (r && r.v === SCHEMA_VERSION) current = r.mode;
    } catch {
      current = null; // 古い形の印（v がない）は、作り直す
    }
  }
  if (current !== mode) await loadAll(db, mode);
  return db;
}

/** 定義と、そのモードの架空のデータを流す（存在するファイルだけ）。役割 app_user は policies.sql が作る */
async function loadAll(db: Db, mode: Mode): Promise<void> {
  await db.exec('drop schema if exists public cascade; create schema public;');
  // 作り直すとき、前の役割が残っていると policies.sql の create role が止まるので先に消す
  for (const r of Object.values(DB_ROLES)) {
    await db.exec(`do $$ begin
      if exists (select 1 from pg_roles where rolname = '${r}') then
        drop owned by ${r};
        drop role ${r};
      end if;
    end $$;`);
  }
  for (const f of SQL_FILES) {
    if (f.name.startsWith('seed_') && f.name !== `seed_${mode}`) continue;
    await db.exec(f.sql);
  }
  // 設定の mode をそのモードにそろえる（settings 表があるときだけ）
  const has = await db.query<{ t: string | null }>(`select to_regclass('public.settings')::text as t`);
  if (has.rows[0]?.t) {
    await db.query(`insert into public.settings (key, value) values ('mode', $1) on conflict (key) do update set value = excluded.value`, [mode]);
  }
  await db.exec('create table public._demo_ready (mode text, v int)'); // 最後に付ける印（モードと定義の版）
  await db.query('insert into public._demo_ready values ($1, $2)', [mode, SCHEMA_VERSION]);
}

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}

/** 最初に戻す：public スキーマを作り直して、架空のデータを入れ直す。mode を渡すとそのモードに切り替える（localStorage に覚える） */
export async function resetDemo(mode?: Mode): Promise<void> {
  const m = mode ?? getStoredMode();
  storeMode(m);
  const db = await getDb();
  await loadAll(db, m);
}

/** 利用者として SQL を実行する。取引の中で set local role app_customer／app_shop をし、customer は app.user_id にお客さんの id を入れる */
export async function withRole<T>(role: Role, customerId: string | number | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  if (role === 'customer' && customerId == null) throw new Error('FORBIDDEN: お客さんが選ばれていません');
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${DB_ROLES[role]}`);
    if (role === 'customer') await tx.query(`select set_config('app.user_id', $1, true)`, [String(customerId)]);
    return fn(tx);
  });
}

/** デモの「今」（DB の demo_now()。設定の demo_today と demo_time から決まる）を ISO 文字列で返す */
export async function demoNow(tx: Pick<Transaction, 'query'>): Promise<string> {
  const r = await tx.query<{ n: string }>(`select to_char(demo_now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"') as n`);
  return r.rows[0].n;
}

/** 取引の中の SQL を実行して行を返す小さなヘルパー */
export async function q<T = Record<string, unknown>>(tx: Pick<Transaction, 'query'>, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await tx.query<T>(sql, params);
  return r.rows;
}

/** 役割の外で読む（お客さんの切り替えの一覧など）。画面の本体の読み込みには使わない */
export async function readPublic<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const r = await db.query<T>(sql, params);
  return r.rows;
}
