// ブラウザの中の DB（PGlite）。docs/contract.md の約束：getDb()・withRole(user, fn)・resetDemo()。
// 画面は必ず withRole の中で SQL を実行する（RLS が効く）。
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { SQL_FILES } from './sql.generated';
import type { SessionUser } from './types';

export * from './types';

/** RLS を受ける役割（policies.sql が作る）。見える範囲は RLS が決める */
export const APP_DB_ROLE = 'app_user';
export const DB_NAME = 'idb://site-manager';

export type Db = PGlite;
let dbPromise: Promise<Db> | null = null;

/** DB を作り、定義（db/*.sql）を流す。dataDir を渡さなければ、ブラウザなら IndexedDB に保存する */
export async function createDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = dataDir ?? (typeof indexedDB !== 'undefined' ? DB_NAME : undefined);
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  // 準備が最後まで終わったときだけ付く印（_demo_ready）で見分ける。途中で画面を閉じて中途半端な DB が残っても、次に開いたとき作り直す
  const ready = await db.query<{ t: string | null }>(`select to_regclass('public._demo_ready')::text as t`);
  if (!ready.rows[0]?.t) await loadAll(db);
  return db;
}

/** 定義と架空のデータを流す（存在するファイルだけ。順番は embed-sql.mjs が決める）。役割 app_user は policies.sql が作る */
async function loadAll(db: Db): Promise<void> {
  await db.exec('drop schema if exists public cascade; create schema public;');
  // 作り直すとき、前の役割が残っていると policies.sql の create role が止まるので先に消す
  await db.exec(`do $$ begin
    if exists (select 1 from pg_roles where rolname = '${APP_DB_ROLE}') then
      drop owned by ${APP_DB_ROLE};
      drop role ${APP_DB_ROLE};
    end if;
  end $$;`);
  for (const f of SQL_FILES) await db.exec(f.sql);
  await db.exec('create table public._demo_ready (v int)'); // 最後に付ける印
}

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}

/** 最初に戻す：public スキーマを作り直して、架空のデータを入れ直す */
export async function resetDemo(): Promise<void> {
  const db = await getDb();
  await loadAll(db);
}

/** 利用者として SQL を実行する。set local role と app.user_id・app.role を設定した取引の中で */
export async function withRole<T>(user: Pick<SessionUser, 'id' | 'role'>, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${APP_DB_ROLE}`);
    await tx.query(`select set_config('app.user_id', $1, true), set_config('app.role', $2, true)`, [user.id, user.role]);
    return fn(tx);
  });
}

/** 取引の中の SQL を実行して行を返す小さなヘルパー */
export async function q<T = Record<string, unknown>>(tx: Pick<Transaction, 'query'>, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await tx.query<T>(sql, params);
  return r.rows;
}

/** ログイン前の一覧など、権限の外で読む（設定の表・デモの利用者の一覧）。画面の本体の読み込みには使わない */
export async function readPublic<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const r = await db.query<T>(sql, params);
  return r.rows;
}
