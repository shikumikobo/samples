-- 役割 × 権限の表の中身（docs/contract.md・docs/permissions.md と同じ）。判定は has_permission() がこの表を引く。
insert into permissions (code, label) values
  ('site.view_all',      '全現場を見る'),
  ('site.view_assigned', '担当の現場だけ見る'),
  ('site.edit',          '現場を変える'),
  ('finance.view',       '金額・見積を見る'),
  ('quote.edit',         '見積を変える'),
  ('schedule.view_all',  '全員の予定を見る'),
  ('schedule.view_own',  '自分の予定だけ見る'),
  ('schedule.edit',      '予定を変える'),
  ('file.view_internal', '社内用のファイルを見る'),
  ('file.manage',        'ファイルと外部への共有を管理する'),
  ('user.manage',        'ユーザーを管理する'),
  ('audit.view',         '変更の履歴を見る'),
  ('portal.view',        '外部の専用ページを見る');

-- 社長：すべて
insert into role_permissions (role, permission) select 'owner', code from permissions;
-- 社員：ユーザー管理・変更の履歴・「担当だけ」の権限以外（全現場・全員の予定を見られる）
insert into role_permissions (role, permission)
  select 'staff', code from permissions
  where code not in ('user.manage', 'audit.view', 'site.view_assigned', 'schedule.view_own');
-- 職人：担当の現場と自分の予定。金額・見積は見えない
insert into role_permissions (role, permission) values
  ('worker', 'site.view_assigned'), ('worker', 'schedule.view_own'), ('worker', 'file.view_internal');
-- 外部（お客さん・協力業者）：専用ページだけ。見える範囲は site_access と共有の設定で決まる
insert into role_permissions (role, permission) values ('customer', 'portal.view'), ('partner', 'portal.view');
