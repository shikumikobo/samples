-- 変更の履歴（audit_log）と更新日時。トリガーは security definer なので、app_user に audit_log の書き込みの権限は要らない。

create function audit_row() returns trigger language plpgsql security definer as $$
declare j jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into audit_log (user_id, table_name, row_id, action, before_row, after_row)
  values (current_user_id(), tg_table_name,
          coalesce(j->>'id', concat_ws(':', j->>'site_id', j->>'user_id', j->>'quote_id', j->>'line_no')),
          tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

create trigger audit_sites       after insert or update or delete on sites       for each row execute function audit_row();
create trigger audit_quotes      after insert or update or delete on quotes      for each row execute function audit_row();
create trigger audit_quote_lines after insert or update or delete on quote_lines for each row execute function audit_row();
create trigger audit_files       after insert or update or delete on files       for each row execute function audit_row();
create trigger audit_site_access after insert or update or delete on site_access for each row execute function audit_row();
create trigger audit_schedules   after insert or update or delete on schedules   for each row execute function audit_row();

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger sites_touch before update on sites for each row execute function touch_updated_at();
