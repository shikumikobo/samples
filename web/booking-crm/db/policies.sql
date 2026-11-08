-- 役割と行の制限（RLS）。docs/contract.md §5。
-- 画面は withRole の中で、DB の役割 app_customer／app_shop に set role して SQL を実行する。
--   customer：自分の予約とプロフィールだけ。customers の note・caution、reservations の note、history の before/after は列の権限で読めない（select * は使えない）
--   shop    ：すべて読める。マスタ（サービス・担当・営業時間・休み・クラス枠・お客さん・設定）は直接書ける
--   予約の作成・変更・キャンセル・来店は、どちらも関数だけ（表への直接の書き込みの権限は付けない）
-- 表の持ち主（スーパーユーザー）は RLS を通らない。seed はこちらで流す。

create role app_customer nologin;
create role app_shop nologin;
-- 作った人が set role できるようにする（Postgres 16 以降は、作っただけでは set role できない）
grant app_customer to current_user;
grant app_shop to current_user;
grant usage on schema public to app_customer, app_shop;

-- 読む：マスタは全員
grant select on settings, services, staff, staff_hours, staff_off, class_sessions to app_customer, app_shop;
grant select on reservations, history to app_shop;
-- お客さんは、予約の note（お店のメモ）と、history の before/after（note を含む）が読めない
grant select (id, customer_id, service_id, staff_id, session_id, starts_at, ends_at, price, is_trial, status, created_at) on reservations to app_customer;
grant select (id, at, actor, action, reservation_id) on history to app_customer;
grant select on customers to app_shop;
grant select (id, name, kana, phone, email, created_at, active) on customers to app_customer;
grant update (name, kana, phone, email) on customers to app_customer;

-- 書く（お店だけ）
grant insert, update on services, staff, class_sessions, customers to app_shop;
grant insert, update, delete on staff_hours, staff_off to app_shop;
grant update on settings to app_shop;
grant usage on sequence reservation_seq to app_customer, app_shop;

grant execute on all functions in schema public to app_customer, app_shop;

alter table settings       enable row level security;
alter table services       enable row level security;
alter table staff          enable row level security;
alter table staff_hours    enable row level security;
alter table staff_off      enable row level security;
alter table class_sessions enable row level security;
alter table customers      enable row level security;
alter table reservations   enable row level security;
alter table history        enable row level security;

-- マスタ：全員が読める
create policy settings_read on settings       for select to app_customer, app_shop using (true);
create policy services_read on services       for select to app_customer, app_shop using (true);
create policy staff_read    on staff          for select to app_customer, app_shop using (true);
create policy hours_read    on staff_hours    for select to app_customer, app_shop using (true);
create policy off_read      on staff_off      for select to app_customer, app_shop using (true);
create policy sessions_read on class_sessions for select to app_customer, app_shop using (true);

-- マスタ：お店だけが書ける
create policy settings_shop on settings       for update to app_shop using (true) with check (true);
create policy services_shop on services       for all to app_shop using (true) with check (true);
create policy staff_shop    on staff          for all to app_shop using (true) with check (true);
create policy hours_shop    on staff_hours    for all to app_shop using (true) with check (true);
create policy off_shop      on staff_off      for all to app_shop using (true) with check (true);
create policy sessions_shop on class_sessions for all to app_shop using (true) with check (true);

-- お客さん：自分の行だけ
create policy customers_shop on customers for all to app_shop using (true) with check (true);
create policy customers_self_read on customers for select to app_customer using (id = current_user_id());
create policy customers_self_upd  on customers for update to app_customer
  using (id = current_user_id()) with check (id = current_user_id());

create policy reservations_shop on reservations for select to app_shop using (true);
create policy reservations_self on reservations for select to app_customer using (customer_id = current_user_id());

-- 履歴：お店はすべて。お客さんは自分の予約のぶんだけ（書き込みの権限は誰にもない）
create policy history_shop on history for select to app_shop using (true);
create policy history_self on history for select to app_customer
  using (reservation_id in (select id from reservations));
