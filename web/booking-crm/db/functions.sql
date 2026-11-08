-- 予約の関数。画面はこれを呼ぶだけ（docs/contract.md §4）。
-- 関数は security definer：お客さんの権限では他人の予約が見えないが、空き枠や定員の計算には全員の予約が要るため。
-- 誰が呼んだかは actor_role()（set role した DB の役割）と current_user_id()（app.user_id）で決める。

-- ── 設定・日付・呼び出した人 ─────────────────────────────

create function setting(k text, d text default null) returns text language sql stable as
$$ select coalesce((select value from settings where key = k), d) $$;

create function setting_int(k text, d int) returns int language sql stable as
$$ select coalesce((select value::int from settings where key = k), d) $$;

-- デモの「今日」（now() は使わない）
create function demo_today() returns date language sql stable as
$$ select setting('demo_today', '2026-11-09')::date $$;

-- デモの「今」。今日の demo_time（設定。なければ 09:00）。直前の判定に使う
create function demo_now() returns timestamptz language sql stable as
$$ select ((demo_today() + setting('demo_time', '09:00')::time) at time zone 'Asia/Tokyo') $$;

create function local_day(t timestamptz) returns date language sql immutable as
$$ select (t at time zone 'Asia/Tokyo')::date $$;

create function current_user_id() returns text language sql stable as
$$ select nullif(current_setting('app.user_id', true), '') $$;

-- 'customer' / 'shop'。DB の役割（app_customer / app_shop）で決める。役割なし（seed・管理）は shop 扱い
create function actor_role() returns text language sql stable as
$$ select case current_setting('role') when 'app_customer' then 'customer' else 'shop' end $$;

create function fail(code text, msg text) returns void language plpgsql as
$$ begin raise exception '%: %', code, msg using errcode = 'P0001'; end $$;

-- ── 空き枠 ─────────────────────────────────────────

-- timed：営業時間・休み・既存の予約・所要時間から slot_minutes 刻みで計算（取れる枠だけ。remaining=1）
-- class ：class_sessions の残り人数（満席は remaining=0 で返す）。session_id も返す
create function available_slots(p_service text, p_staff text, p_from date, p_to date)
returns table (staff_id text, starts_at timestamptz, ends_at timestamptz, remaining int, session_id text)
language plpgsql stable security definer as $$
#variable_conflict use_column
declare
  svc services;
  step interval := make_interval(mins => setting_int('slot_minutes', 15));
  lead timestamptz := demo_now() + make_interval(hours => setting_int('min_lead_hours', 2));
  last_day date := demo_today() + setting_int('booking_window_days', 60);
begin
  select * into svc from services where id = p_service and active;
  if not found then return; end if;

  if svc.kind = 'timed' then
    return query
    select s.id, t.st, t.st + make_interval(mins => svc.duration_min), 1, null::text
    from staff s
    cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d(day)
    join staff_hours h on h.staff_id = s.id and h.weekday = extract(dow from d.day)::int
    cross join lateral generate_series(
        ((d.day::date + h.open_time) at time zone 'Asia/Tokyo'),
        ((d.day::date + h.close_time) at time zone 'Asia/Tokyo') - make_interval(mins => svc.duration_min),
        step) t(st)
    where s.active
      and (p_staff is null or s.id = p_staff)
      and not exists (select 1 from staff_off o where o.staff_id = s.id and o.day = d.day::date)
      and t.st >= lead
      and local_day(t.st) <= last_day
      and not exists (
        select 1 from reservations r
        where r.staff_id = s.id and r.session_id is null and r.status <> 'canceled'
          and tstzrange(r.starts_at, r.ends_at) && tstzrange(t.st, t.st + make_interval(mins => svc.duration_min)))
    order by 2, 1;
  else
    return query
    select cs.staff_id, cs.starts_at, cs.ends_at,
           greatest(cs.capacity - (select count(*)::int from reservations r
                                   where r.session_id = cs.id and r.status <> 'canceled'), 0),
           cs.id
    from class_sessions cs
    where cs.service_id = p_service
      and (p_staff is null or cs.staff_id = p_staff)
      and local_day(cs.starts_at) between p_from and p_to
      and cs.starts_at >= lead
      and local_day(cs.starts_at) <= last_day
      and not exists (select 1 from staff_off o where o.staff_id = cs.staff_id and o.day = local_day(cs.starts_at))
    order by 2, 1;
  end if;
end $$;

-- ── 予約できるかの確認（reserve と change_reservation が使う） ──
-- 順番：TRIAL_USED → DAY_LIMIT → TOO_LATE／TOO_FAR → OUT_OF_HOURS → SLOT_FULL
-- NOT_FOUND・FORBIDDEN は呼び出し側で先に確かめる。担当（timed）または枠（class）の行を for update でロックしてから数える。
-- p_exclude：変更のとき、自分自身の予約（枠の数・同じ日の件数・重なりから除く）
create function check_and_lock(p_customer text, p_service text, p_staff text, p_start timestamptz,
                               p_session text, p_exclude text)
returns table (o_staff text, o_session text, o_start timestamptz, o_end timestamptz)
language plpgsql security definer as $$
declare
  svc services;
  cs class_sessions;
  me customers;
  v_start timestamptz;
  v_end timestamptz;
  v_staff text;
  lstart timestamp;
  lend timestamp;
  wd int;
  h staff_hours;
  slot int := setting_int('slot_minutes', 15);
  cnt int;
begin
  select * into svc from services where id = p_service and active;
  if not found then perform fail('NOT_FOUND', 'メニューが見つかりません'); end if;
  select * into me from customers where id = p_customer;
  if not found then perform fail('NOT_FOUND', 'お客さんが見つかりません'); end if;

  if svc.kind = 'class' then
    select * into cs from class_sessions where id = p_session and service_id = p_service;
    if not found then perform fail('NOT_FOUND', '枠が見つかりません'); end if;
    v_start := cs.starts_at; v_end := cs.ends_at; v_staff := cs.staff_id;
  else
    perform 1 from staff where id = p_staff and active;
    if not found or p_start is null then perform fail('NOT_FOUND', '担当が見つかりません'); end if;
    v_start := p_start; v_end := p_start + make_interval(mins => svc.duration_min); v_staff := p_staff;
  end if;

  -- 初回限定の体験：同じ人（電話またはメールが同じ）に、体験の予約（キャンセル以外）がある
  if p_exclude is null and svc.first_time_only then
    perform 1 from reservations r join customers c on c.id = r.customer_id
    where r.is_trial and r.status <> 'canceled'
      and (c.id = me.id
           or (me.phone <> '' and c.phone = me.phone)
           or (me.email <> '' and c.email = me.email));
    if found then perform fail('TRIAL_USED', '初回限定の体験は、すでに使われています'); end if;
  end if;

  -- 同じ日に取れるのは max_per_day 件まで
  select count(*) into cnt from reservations r
  where r.customer_id = p_customer and r.status <> 'canceled'
    and r.id is distinct from p_exclude and local_day(r.starts_at) = local_day(v_start);
  if cnt >= setting_int('max_per_day', 2) then
    perform fail('DAY_LIMIT', '同じ日に取れるのは ' || setting_int('max_per_day', 2) || ' 件までです');
  end if;

  if v_start < demo_now() + make_interval(hours => setting_int('min_lead_hours', 2)) then
    perform fail('TOO_LATE', '直前の予約は取れません');
  end if;
  if local_day(v_start) > demo_today() + setting_int('booking_window_days', 60) then
    perform fail('TOO_FAR', '先すぎる日は取れません');
  end if;

  -- 営業時間・休み
  perform 1 from staff_off where staff_id = v_staff and day = local_day(v_start);
  if found then perform fail('OUT_OF_HOURS', '担当の休みの日です'); end if;
  if svc.kind = 'timed' then
    lstart := v_start at time zone 'Asia/Tokyo';
    lend   := v_end   at time zone 'Asia/Tokyo';
    wd := extract(dow from lstart)::int;
    select * into h from staff_hours where staff_id = v_staff and weekday = wd;
    if not found
       or lstart::date <> lend::date
       or lstart::time < h.open_time or lend::time > h.close_time
       or (extract(epoch from lstart::time)::int % (slot * 60)) <> 0 then
      perform fail('OUT_OF_HOURS', '営業時間の外です');
    end if;
  end if;

  -- 満席・重なり：行をロックしてから数える
  if svc.kind = 'timed' then
    perform 1 from staff where id = v_staff for update;
    perform 1 from reservations r
    where r.staff_id = v_staff and r.session_id is null and r.status <> 'canceled'
      and r.id is distinct from p_exclude
      and tstzrange(r.starts_at, r.ends_at) && tstzrange(v_start, v_end);
    if found then perform fail('SLOT_FULL', 'その時間は埋まっています'); end if;
  else
    perform 1 from class_sessions where id = cs.id for update;
    select count(*) into cnt from reservations r
    where r.session_id = cs.id and r.status <> 'canceled' and r.id is distinct from p_exclude;
    if cnt >= cs.capacity then perform fail('SLOT_FULL', '満席です'); end if;
    perform 1 from reservations r
    where r.session_id = cs.id and r.status <> 'canceled' and r.customer_id = p_customer
      and r.id is distinct from p_exclude;
    if found then perform fail('SLOT_FULL', '同じ枠はすでに予約されています'); end if;
  end if;

  return query select v_staff, case when svc.kind = 'class' then cs.id end, v_start, v_end;
end $$;

-- 変更・キャンセルの期限：開始日の前日の終わりまで（cancel_deadline = prev_day_end）
create function past_deadline(p_start timestamptz) returns boolean language sql stable as
$$ select demo_now() >= ((local_day(p_start)::timestamp) at time zone 'Asia/Tokyo') $$;

-- ── 予約の作成・変更・キャンセル・来店 ─────────────────

create function reserve(p_customer text, p_service text, p_staff text, p_start timestamptz, p_session text)
returns text language plpgsql security definer as $$
declare
  svc services;
  c record;
  rid text;
begin
  select * into svc from services where id = p_service and active;
  if not found then perform fail('NOT_FOUND', 'メニューが見つかりません'); end if;
  perform 1 from customers where id = p_customer;
  if not found then perform fail('NOT_FOUND', 'お客さんが見つかりません'); end if;
  if actor_role() = 'customer' and p_customer is distinct from current_user_id() then
    perform fail('FORBIDDEN', '他の人の予約は取れません');
  end if;

  select * into c from check_and_lock(p_customer, p_service, p_staff, p_start, p_session, null);
  rid := 'R' || nextval('reservation_seq');
  insert into reservations (id, customer_id, service_id, staff_id, session_id, starts_at, ends_at, price, is_trial, status, created_at)
  values (rid, p_customer, p_service, c.o_staff, c.o_session, c.o_start, c.o_end, svc.price, svc.is_trial, 'booked', demo_now());
  return rid;
end $$;

-- 同じ予約番号のまま、新しい枠を確かめて取れたときだけ書き換える。失敗したら元のまま
create function change_reservation(p_id text, p_staff text, p_start timestamptz, p_session text)
returns text language plpgsql security definer as $$
declare
  r reservations;
  c record;
begin
  select * into r from reservations where id = p_id and status = 'booked' for update;
  if not found then perform fail('NOT_FOUND', '予約が見つかりません'); end if;
  if actor_role() = 'customer' and r.customer_id is distinct from current_user_id() then
    perform fail('FORBIDDEN', '他の人の予約は変えられません');
  end if;
  if actor_role() = 'customer' and past_deadline(r.starts_at) then
    perform fail('DEADLINE_PASSED', '変更できる期限（前日まで）を過ぎています');
  end if;

  select * into c from check_and_lock(r.customer_id, r.service_id, p_staff, p_start, p_session, r.id);
  update reservations set staff_id = c.o_staff, session_id = c.o_session,
                          starts_at = c.o_start, ends_at = c.o_end
  where id = r.id;
  return r.id;
end $$;

-- p_reason：キャンセルの理由（任意）。予約のお店のメモ（reservations.note）に足す。
--   お客さん本人のとき：先頭に「【お客さんの理由】」を付け、すでにメモがあれば改行で続ける（お客さんはメモを読めない）
--   お店のとき：そのまま足す。200字まで
create function cancel_reservation(p_id text, p_reason text default null) returns text language plpgsql security definer as $$
declare
  r reservations;
  reason text := left(btrim(coalesce(p_reason, '')), 200);
  added text;
begin
  select * into r from reservations where id = p_id and status = 'booked' for update;
  if not found then perform fail('NOT_FOUND', '予約が見つかりません'); end if;
  if actor_role() = 'customer' and r.customer_id is distinct from current_user_id() then
    perform fail('FORBIDDEN', '他の人の予約は取り消せません');
  end if;
  if actor_role() = 'customer' and past_deadline(r.starts_at) then
    perform fail('DEADLINE_PASSED', 'キャンセルできる期限（前日まで）を過ぎています');
  end if;
  added := case when reason = '' then '' when actor_role() = 'customer' then '【お客さんの理由】' || reason else reason end;
  update reservations
     set status = 'canceled',
         note = case when added = '' then note when note = '' then added else note || chr(10) || added end
   where id = p_id;
  return p_id;
end $$;

create function set_visit_status(p_id text, p_status text) returns text language plpgsql security definer as $$
begin
  perform 1 from reservations where id = p_id and status = 'booked' for update;
  if not found then perform fail('NOT_FOUND', '予約が見つかりません'); end if;
  if actor_role() <> 'shop' then perform fail('FORBIDDEN', 'お店の人だけができます'); end if;
  update reservations set status = p_status where id = p_id;
  return p_id;
end $$;

-- ── 電話番号の重複の確認（お店だけ） ─────────────────────
-- 数字だけにして（ハイフン・空白・全角の記号を除く）比べる。
create function normalize_phone(p text) returns text language sql immutable as
$$ select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') $$;

-- 同じ電話番号の、いまのお客さん（active）の id。いなければ null。電話が空なら確認しない（null）。
-- 複数いるとき（見本の体験の確認用のデータにある）は、登録の古い順の先頭
create function find_customer_by_phone(p_phone text) returns text language plpgsql stable security definer as $$
declare d text := normalize_phone(p_phone); cid text;
begin
  if actor_role() <> 'shop' then perform fail('FORBIDDEN', 'お店の人だけができます'); end if;
  if d = '' then return null; end if;
  select id into cid from customers where active and normalize_phone(phone) = d order by created_at, id limit 1;
  return cid;
end $$;

-- ── 保存後の修正・メモ（お店だけ） ─────────────────────
-- 予約のお店のメモ（キャンセルの理由・来店のひとことなど）。history には action='update' で before/after が残る
create function set_reservation_note(p_id text, p_note text) returns text language plpgsql security definer as $$
begin
  if actor_role() <> 'shop' then perform fail('FORBIDDEN', 'お店の人だけができます'); end if;
  perform 1 from reservations where id = p_id for update;
  if not found then perform fail('NOT_FOUND', '予約が見つかりません'); end if;
  update reservations set note = coalesce(p_note, '') where id = p_id and note is distinct from coalesce(p_note, '');
  return p_id;
end $$;

-- 状態を、保存後でも直す：booked／visited／noshow／canceled のどれからどれへも。p_note があればメモも同時に書く（キャンセルの理由）。
-- canceled から戻すときだけ、元の枠が今も空いているか確かめる（重なり・定員）。空いていなければ SLOT_TAKEN
-- history：booked に戻す＝'restore'、visited＝'visit'、noshow＝'noshow'、canceled＝'cancel'（log_reservation）
create function set_reservation_status(p_id text, p_status text, p_note text default null)
returns text language plpgsql security definer as $$
declare
  r reservations;
  cs class_sessions;
  cnt int;
begin
  if actor_role() <> 'shop' then perform fail('FORBIDDEN', 'お店の人だけができます'); end if;
  if p_status is null or p_status not in ('booked', 'visited', 'noshow', 'canceled') then
    perform fail('NOT_FOUND', '状態が正しくありません');
  end if;
  select * into r from reservations where id = p_id for update;
  if not found then perform fail('NOT_FOUND', '予約が見つかりません'); end if;

  if r.status = 'canceled' and p_status <> 'canceled' then
    if r.session_id is null then
      perform 1 from staff where id = r.staff_id for update;
      perform 1 from reservations x
      where x.staff_id = r.staff_id and x.session_id is null and x.status <> 'canceled' and x.id <> r.id
        and tstzrange(x.starts_at, x.ends_at) && tstzrange(r.starts_at, r.ends_at);
      if found then perform fail('SLOT_TAKEN', 'この時間には、もう別の予約が入っています'); end if;
    else
      select * into cs from class_sessions where id = r.session_id for update;
      select count(*) into cnt from reservations x where x.session_id = r.session_id and x.status <> 'canceled' and x.id <> r.id;
      if cnt >= cs.capacity then perform fail('SLOT_TAKEN', 'この枠は、もう満席です'); end if;
      perform 1 from reservations x where x.session_id = r.session_id and x.status <> 'canceled' and x.customer_id = r.customer_id and x.id <> r.id;
      if found then perform fail('SLOT_TAKEN', '同じ枠に、すでに申し込まれています'); end if;
    end if;
  end if;

  update reservations set status = p_status, note = coalesce(p_note, note)
  where id = p_id and (status is distinct from p_status or note is distinct from coalesce(p_note, note));
  return p_id;
end $$;

create function mark_visited(p_id text) returns text language sql security definer as
$$ select set_visit_status(p_id, 'visited') $$;
create function mark_noshow(p_id text) returns text language sql security definer as
$$ select set_visit_status(p_id, 'noshow') $$;

-- ── そろそろ来店 ───────────────────────────────────

-- 最後の来店（visited）から、そのサービスの return_days を過ぎたお客さん。過ぎた日数が多い順
create function due_for_return(p_as_of date)
returns table (customer_id text, last_visit date, service_id text, due_since_days int)
language plpgsql stable security definer as $$
begin
  if actor_role() <> 'shop' then perform fail('FORBIDDEN', 'お店の人だけが見られます'); end if;
  return query
  select l.customer_id, l.d, l.service_id, (p_as_of - l.d - l.return_days)::int
  from (
    select distinct on (r.customer_id) r.customer_id, local_day(r.starts_at) as d, r.service_id, s.return_days
    from reservations r join services s on s.id = r.service_id
    join customers c on c.id = r.customer_id and c.active
    where r.status = 'visited' and local_day(r.starts_at) <= p_as_of
    order by r.customer_id, r.starts_at desc
  ) l
  where l.return_days is not null and p_as_of - l.d > l.return_days
  order by 4 desc, 1;
end $$;

-- ── 埋まっている時間（お客さん画面の日時の表用） ─────────────
-- サロン型（枠ではない）の、キャンセルでない予約の「担当・開始・終了」だけを返す。お客さんの名前などは返さない。
-- お客さんは他人の予約を読めないが、表で「埋まっている時間」を見せるのに要るため、security definer。
create function busy_blocks(p_day date)
returns table (staff_id text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer as $$
  select r.staff_id, r.starts_at, r.ends_at
  from reservations r
  where r.session_id is null and r.status <> 'canceled' and local_day(r.starts_at) = p_day
  order by 2, 1
$$;
