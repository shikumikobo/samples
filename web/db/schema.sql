-- Site Manager（現場管理アプリ）の表。Postgres（Supabase と PGlite の両方で同じに動く）。
-- 権限の判定は functions.sql の has_permission() と policies.sql（RLS）に集める。
-- 台帳（samples/_shared/ledger.json）の列と対応させる：docs/ledger-mapping.md

-- 役割：owner=社長（管理者）、staff=社員（営業・事務）、worker=職人（スタッフ）、customer=お客さん、partner=協力業者
create type app_role as enum ('owner', 'staff', 'worker', 'customer', 'partner');
create type site_status as enum ('受付', '見積中', '受注', '着工', '完工', '請求済み', '入金済み', '完了', '失注', '無効');
create type file_visibility as enum ('internal', 'customer', 'partner', 'both');  -- 社内のみ／お客さんに共有／協力業者に共有／両方

create table app_users (
  id text primary key,                 -- 'E-01' など（外部は 'X-01'）
  name text not null,
  role app_role not null,
  title text,                          -- 営業・事務・大工・協力業者名など（表示用）
  email text,
  active boolean not null default true
);

-- 役割 × 権限の表
create table permissions (code text primary key, label text not null);
create table role_permissions (
  role app_role not null,
  permission text not null references permissions(code),
  primary key (role, permission)
);

create table customers (
  id text primary key,                 -- 'C-0001'
  name text not null, kana text, address text, phone text, email text,
  status text not null default '成約'
);

create table sites (
  id text primary key,                 -- 'S-2611-01'
  customer_id text not null references customers(id),
  name text not null,
  address text,
  status site_status not null default '受付',
  staff_id text references app_users(id),   -- 担当者（職人は自分が担当の現場だけ見える）
  received_on date,
  planned_start date, planned_end date,
  updated_at timestamptz not null default now()
);

-- 金額は別の表に分ける（職人には出さない。列ごとの RLS は書けないため）
create table site_finance (
  site_id text primary key references sites(id),
  contract_amount integer not null default 0
);

create table schedules (
  id text primary key,                 -- 'Y-000001'
  site_id text not null references sites(id),
  day date not null,
  start_time text,
  work text not null,
  staff_id text references app_users(id),
  memo text,
  status text not null default '予定'  -- 予定／取消
);

create table quotes (
  id text primary key,                 -- 'Q-2611-01-1'（現場番号＋版）
  site_id text not null references sites(id),
  version integer not null default 1,
  title text not null,
  issued_on date,
  status text not null default '下書き',  -- 下書き／提出／承認
  tax_rate numeric not null default 0.10,
  created_by text references app_users(id)
);
create table quote_lines (
  quote_id text not null references quotes(id),
  line_no integer not null,
  item text not null, qty numeric not null, unit text, unit_price integer not null,
  primary key (quote_id, line_no)
);
-- 金額 ＝ 数量 × 単価。消費税は合計に1回、10%、切り捨て（docs で説明）

create table files (
  id text primary key,
  site_id text not null references sites(id),
  name text not null,
  kind text not null,                  -- 図面・写真・書類
  path text not null,                  -- public/sample-files/ の中のファイル
  visibility file_visibility not null default 'internal',
  uploaded_by text references app_users(id),
  created_at timestamptz not null default now()
);

-- 外部ユーザー（お客さん・協力業者）が見てよい現場
create table site_access (
  site_id text not null references sites(id),
  user_id text not null references app_users(id),
  primary key (site_id, user_id)
);

-- 変更の履歴（triggers.sql が書く。画面から直せない）
create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id text,
  table_name text not null,
  row_id text not null,
  action text not null,                -- INSERT／UPDATE／DELETE
  before_row jsonb,
  after_row jsonb
);
