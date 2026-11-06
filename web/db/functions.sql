-- 今の利用者は、セッションの設定（app.user_id・app.role）で渡す。
-- Supabase にするときは、auth.uid() と JWT の役割に置き換える（README の「本番にする場合」）。

create function current_user_id() returns text language sql stable as
$$ select nullif(current_setting('app.user_id', true), '') $$;

create function current_app_role() returns app_role language sql stable as
$$ select nullif(current_setting('app.role', true), '')::app_role $$;

-- 役割 × 権限の表を引く。判定はここに集める（画面は表を読んで出し分けるだけ）
create function has_permission(p text) returns boolean language sql stable security definer as
$$ select exists (select 1 from role_permissions rp where rp.role = current_app_role() and rp.permission = p) $$;

-- 職人：担当の現場か。外部：許可された現場か
create function is_assigned_site(s text) returns boolean language sql stable security definer as
$$ select exists (select 1 from sites where id = s and staff_id = current_user_id()) $$;

create function has_site_access(s text) returns boolean language sql stable security definer as
$$ select exists (select 1 from site_access where site_id = s and user_id = current_user_id()) $$;
