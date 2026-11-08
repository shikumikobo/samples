-- 変更の履歴（history）。予約の作成・変更・キャンセル・来店を、トリガーが書く。更新・削除はできない。
-- トリガーは security definer なので、app_customer・app_shop に history の書き込みの権限は要らない。

create function log_reservation() returns trigger language plpgsql security definer as $$
declare
  act text;
  who text := case when actor_role() = 'customer' then 'customer:' || current_user_id() else 'shop' end;
begin
  if tg_op = 'INSERT' then
    insert into history (at, actor, action, reservation_id, before, after)
    values (new.created_at, who, 'create', new.id, null, to_jsonb(new));
  else
    act := case
      when old.status <> new.status then
        case new.status when 'canceled' then 'cancel' when 'visited' then 'visit' when 'noshow' then 'noshow' else 'update' end
      when old.staff_id <> new.staff_id or old.starts_at <> new.starts_at or old.session_id is distinct from new.session_id then 'change'
      else 'update' end;
    insert into history (at, actor, action, reservation_id, before, after)
    values (demo_now(), who, act, new.id, to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end $$;

create trigger reservations_history after insert or update on reservations
  for each row execute function log_reservation();

-- 予約は消さない
create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'FORBIDDEN: % は変えられません（%）', tg_table_name, lower(tg_op) using errcode = 'P0001';
end $$;

create trigger history_no_update before update or delete on history for each row execute function forbid_change();
create trigger history_no_truncate before truncate on history for each statement execute function forbid_change();
create trigger reservations_no_delete before delete on reservations for each row execute function forbid_change();
