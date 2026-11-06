-- 行ごとのアクセス制御（RLS）。権限の判定は has_permission()・is_assigned_site()・has_site_access() に集める。
-- 画面は、役割 app_user に set role して使う（withRole）。表の持ち主（スーパーユーザー）は RLS を通らない。

create role app_user nologin;
-- 作った人（Supabase なら postgres）が set role app_user できるようにする（Postgres 16 以降は、作っただけでは set role できない）
grant app_user to current_user;
grant usage on schema public to app_user;
grant select on all tables in schema public to app_user;
grant insert, update on customers, sites, site_finance, schedules, quotes, quote_lines, files, app_users to app_user;
grant insert, delete on site_access to app_user;
-- audit_log・permissions・role_permissions には書き込みの権限を付けない

-- 外部ユーザーか（お客さん・協力業者）
create function is_external() returns boolean language sql stable as
$$ select current_app_role() in ('customer', 'partner') $$;

alter table app_users        enable row level security;
alter table permissions      enable row level security;
alter table role_permissions enable row level security;
alter table customers        enable row level security;
alter table sites            enable row level security;
alter table site_finance     enable row level security;
alter table schedules        enable row level security;
alter table quotes           enable row level security;
alter table quote_lines      enable row level security;
alter table files            enable row level security;
alter table site_access      enable row level security;
alter table audit_log        enable row level security;

-- 権限の表：画面が出し分けに読む
create policy perm_read  on permissions      for select to app_user using (true);
create policy rperm_read on role_permissions for select to app_user using (true);

-- ユーザー：管理できる人と社員は全員。ほかは自分と、自分が見られる現場の担当者だけ
create policy users_select on app_users for select to app_user using (
  has_permission('user.manage') or has_permission('site.view_all') or id = current_user_id()
  or exists (select 1 from sites s where s.staff_id = app_users.id)  -- sites の RLS が効く（見られる現場の担当者だけ）
);
create policy users_insert on app_users for insert to app_user with check (has_permission('user.manage'));
create policy users_update on app_users for update to app_user using (has_permission('user.manage')) with check (has_permission('user.manage'));

-- 顧客：全現場を見られる人と、担当の現場の顧客（職人）。外部には出さない
create policy customers_select on customers for select to app_user using (
  has_permission('site.view_all')
  or (has_permission('site.view_assigned') and exists (select 1 from sites s where s.customer_id = customers.id))
);
create policy customers_insert on customers for insert to app_user with check (has_permission('site.edit'));
create policy customers_update on customers for update to app_user using (has_permission('site.edit')) with check (has_permission('site.edit'));

-- 現場：全部／担当の現場／許可された現場（外部）
create policy sites_select on sites for select to app_user using (
  has_permission('site.view_all')
  or (has_permission('site.view_assigned') and staff_id = current_user_id())
  or (is_external() and has_permission('portal.view') and has_site_access(id))
);
create policy sites_insert on sites for insert to app_user with check (has_permission('site.edit'));
create policy sites_update on sites for update to app_user using (has_permission('site.edit')) with check (has_permission('site.edit'));

-- 金額：finance.view だけ（職人・外部には出ない）
create policy finance_select on site_finance for select to app_user using (has_permission('finance.view'));
create policy finance_insert on site_finance for insert to app_user with check (has_permission('finance.view') and has_permission('site.edit'));
create policy finance_update on site_finance for update to app_user using (has_permission('finance.view') and has_permission('site.edit'))
  with check (has_permission('finance.view') and has_permission('site.edit'));

-- 予定：全員分／自分の分／許可された現場（外部。取り消した予定は出さない）
create policy schedules_select on schedules for select to app_user using (
  has_permission('schedule.view_all')
  or (has_permission('schedule.view_own') and staff_id = current_user_id())
  or (is_external() and has_permission('portal.view') and has_site_access(site_id) and status <> '取消')
);
create policy schedules_insert on schedules for insert to app_user with check (has_permission('schedule.edit'));
create policy schedules_update on schedules for update to app_user using (has_permission('schedule.edit')) with check (has_permission('schedule.edit'));

-- 見積：finance.view の人。お客さんは、許可された現場の「提出」「承認」だけ。協力業者は見られない
create policy quotes_select on quotes for select to app_user using (
  has_permission('finance.view')
  or (current_app_role() = 'customer' and has_permission('portal.view') and has_site_access(site_id) and status in ('提出', '承認'))
);
create policy quotes_insert on quotes for insert to app_user with check (has_permission('quote.edit'));
create policy quotes_update on quotes for update to app_user using (has_permission('quote.edit')) with check (has_permission('quote.edit'));
create policy qlines_select on quote_lines for select to app_user using (
  exists (select 1 from quotes q where q.id = quote_lines.quote_id)  -- quotes の RLS が効く
);
create policy qlines_insert on quote_lines for insert to app_user with check (has_permission('quote.edit'));
create policy qlines_update on quote_lines for update to app_user using (has_permission('quote.edit')) with check (has_permission('quote.edit'));

-- ファイル：社内用を見られる人（職人は担当の現場だけ）／外部は共有された分だけ
create policy files_select on files for select to app_user using (
  (has_permission('file.view_internal') and (has_permission('site.view_all') or is_assigned_site(site_id)))
  or (current_app_role() = 'customer' and has_permission('portal.view') and has_site_access(site_id) and visibility in ('customer', 'both'))
  or (current_app_role() = 'partner'  and has_permission('portal.view') and has_site_access(site_id) and visibility in ('partner', 'both'))
);
create policy files_insert on files for insert to app_user with check (has_permission('file.manage'));
create policy files_update on files for update to app_user using (has_permission('file.manage')) with check (has_permission('file.manage'));

-- 外部への許可：付け外しは file.manage。外部の人は自分の行だけ見える
create policy access_select on site_access for select to app_user using (
  has_permission('file.manage') or user_id = current_user_id()
);
create policy access_insert on site_access for insert to app_user with check (has_permission('file.manage'));
create policy access_delete on site_access for delete to app_user using (has_permission('file.manage'));

-- 変更の履歴：見られるのは audit.view だけ。書き込みはトリガー（security definer）だけ
create policy audit_select on audit_log for select to app_user using (has_permission('audit.view'));
