// @vitest-environment node
// 実際の db/*.sql と seed を流した DB で、お店側の画面の SQL を通す。
import { describe, expect, it } from 'vitest';
import { resetDemo, withRole, q } from '@/lib/db';
import { errorCode } from '@/lib/errors';
import {
  addOff,
  changeTo,
  loadCustomer,
  loadCustomers,
  loadDue,
  loadHistory,
  loadHours,
  loadReservations,
  loadServices,
  loadSessions,
  loadSlots,
  loadStaff,
  loadToday,
  markVisited,
  removeOff,
  reserveFor,
  saveHours,
  saveKarte,
  saveService,
  setNote,
  setStatus,
} from './queries';
import { dayOf, trialKind } from './lib';

const shop = <T,>(fn: Parameters<typeof withRole<T>>[2]) => withRole<T>('shop', null, fn);

describe('お店側の SQL（サロンの seed）', () => {
  it('予約の作成 → 来店済み → 履歴に残る', async () => {
    const out = await shop(async (tx) => {
      const today = await loadToday(tx);
      expect(today).toBe('2026-11-09');
      const svc = (await loadServices(tx, true)).find((s) => !s.is_trial && s.kind === 'timed')!;
      const slots = await loadSlots(tx, svc.id, null, '2026-11-12');
      expect(slots.length).toBeGreaterThan(0);
      const id = await reserveFor(tx, 'c25', svc.id, slots[0]);
      await markVisited(tx, id);
      const rs = (await loadReservations(tx, '2026-11-12', '2026-11-12')).filter((r) => r.id === id);
      const hist = (await loadHistory(tx, 'c25')).filter((h) => h.reservation_id === id).map((h) => h.action);
      return { rs, hist };
    });
    expect(out.rs).toHaveLength(1);
    expect(out.rs[0].status).toBe('visited');
    expect(out.rs[0].starts_at).toMatch(/^2026-11-12T\d\d:\d\d:00\+09:00$/);
    expect(out.hist).toEqual(expect.arrayContaining(['create', 'visit']));
  }, 60000);

  it('期限（前日の終わり）を過ぎた予約を、お店は変更できる（お客さんはできない）', async () => {
    const { id, slot } = await shop(async (tx) => {
      const svc = (await loadServices(tx, true)).find((s) => !s.is_trial && s.kind === 'timed')!;
      const todaySlots = await loadSlots(tx, svc.id, null, '2026-11-09');
      expect(todaySlots.length).toBeGreaterThan(0); // 今日の夕方にまだ空きがある
      const rid = await reserveFor(tx, 'c24', svc.id, todaySlots[0]);
      const later = await loadSlots(tx, svc.id, null, '2026-11-13');
      return { id: rid, slot: later[0] };
    });
    // 今日の予約は期限を過ぎている：お客さんは変更できない
    let err: unknown = null;
    try {
      await withRole('customer', 'c24', (tx) => q(tx, 'select change_reservation($1, $2, $3::timestamptz, $4)', [id, slot.staff_id, slot.starts_at, null]));
    } catch (e) {
      err = e;
    }
    expect(errorCode(err)).toBe('DEADLINE_PASSED');
    // お店は変更できる
    const after = await shop(async (tx) => {
      await changeTo(tx, id, slot);
      return (await loadReservations(tx, '2026-11-13', '2026-11-13')).find((r) => r.id === id);
    });
    expect(after && dayOf(after.starts_at)).toBe('2026-11-13');
  }, 60000);

  it('そろそろ来店の一覧が出る（過ぎた日数の多い順・名前つき）', async () => {
    const due = await shop(async (tx) => loadDue(tx, await loadToday(tx)));
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((d) => d.due_since_days > 0 && d.customer_name && d.service_name && /^\d{4}-\d\d-\d\d$/.test(d.last_visit))).toBe(true);
    const days = due.map((d) => d.due_since_days);
    expect(days).toEqual([...days].sort((a, b) => b - a));
  }, 60000);

  it('お客さんの一覧：体験のみ／体験から通常に来た が出る', async () => {
    const list = await shop((tx) => loadCustomers(tx));
    expect(list.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(list.map(trialKind));
    expect(kinds.has('trial_only') || kinds.has('converted')).toBe(true);
  }, 60000);

  it('カルテの note・caution をお店が書き換えられる。お客さんには見えない', async () => {
    await shop((tx) => saveKarte(tx, 'c01', '次回は短めに', 'ラテックスアレルギー'));
    const c = await shop((tx) => loadCustomer(tx, 'c01'));
    expect(c).toMatchObject({ note: '次回は短めに', caution: 'ラテックスアレルギー' });
    await expect(withRole('customer', 'c01', (tx) => q(tx, 'select note from customers'))).rejects.toThrow(/permission denied/);
  }, 60000);

  it('保存後の修正：来店済み→予約済みに戻す／メモ／キャンセルの理由。履歴に残り、お客さんにはメモが見えない', async () => {
    const out = await shop(async (tx) => {
      const svc = (await loadServices(tx, true)).find((s) => !s.is_trial && s.kind === 'timed')!;
      const slots = await loadSlots(tx, svc.id, null, '2026-11-17');
      const id = await reserveFor(tx, 'c23', svc.id, slots[0]);
      await markVisited(tx, id);
      await setStatus(tx, id, 'booked');
      await setNote(tx, id, '次回はカラーを変えたい');
      await setStatus(tx, id, 'canceled', '体調不良のため');
      const r = (await loadReservations(tx, '2026-11-17', '2026-11-17')).find((x) => x.id === id)!;
      const acts = (await loadHistory(tx, 'c23')).filter((h) => h.reservation_id === id).map((h) => h.action).reverse();
      return { id, r, acts };
    });
    expect(out.r).toMatchObject({ status: 'canceled', note: '体調不良のため' });
    expect(out.acts).toEqual(['create', 'visit', 'restore', 'update', 'cancel']);
    // お客さんは、予約の note も、履歴の before/after も読めない（列の権限）
    await expect(withRole('customer', 'c23', (tx) => q(tx, 'select note from reservations'))).rejects.toThrow(/permission denied/);
    await expect(withRole('customer', 'c23', (tx) => q(tx, 'select after from history'))).rejects.toThrow(/permission denied/);
    // お客さんは状態を直せない
    let err: unknown = null;
    try {
      await withRole('customer', 'c23', (tx) => q(tx, `select set_reservation_status($1, 'booked')`, [out.id]));
    } catch (e) {
      err = e;
    }
    expect(errorCode(err)).toBe('FORBIDDEN');
  }, 60000);

  it('設定：サービス・営業時間・休みが shop の権限で書ける（policies.sql）', async () => {
    await shop(async (tx) => {
      const s = (await loadServices(tx))[0];
      await saveService(tx, { ...s, price: s.price + 100, return_days: 30 });
      const s2 = (await loadServices(tx)).find((x) => x.id === s.id)!;
      expect(s2.price).toBe(s.price + 100);
      expect(s2.return_days).toBe(30);

      const st = (await loadStaff(tx))[0];
      await saveHours(tx, st.id, [{ weekday: 1, open_time: '09:00', close_time: '12:00' }]);
      expect((await loadHours(tx)).filter((h) => h.staff_id === st.id)).toEqual([{ staff_id: st.id, weekday: 1, open_time: '09:00', close_time: '12:00' }]);

      await addOff(tx, st.id, '2026-12-01', '研修');
      const { loadOff } = await import('./queries');
      expect((await loadOff(tx, '2026-12-01', '2026-12-01')).map((o) => o.note)).toEqual(['研修']);
      await removeOff(tx, st.id, '2026-12-01');
      expect(await loadOff(tx, '2026-12-01', '2026-12-01')).toEqual([]);
    });
  }, 60000);
});

describe('お店側の SQL（教室の seed）', () => {
  it('教室：枠ごとの人数と定員が出て、満席でない枠に申込みを入れて出席にできる', async () => {
    await resetDemo('class');
    await shop(async (tx) => {
      const sessions = await loadSessions(tx, '2026-11-09', '2026-12-31');
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.capacity >= 4 && s.booked <= s.capacity)).toBe(true);
      const open = sessions.find((s) => s.booked < s.capacity && s.starts_at > '2026-11-10');
      expect(open).toBeTruthy();
      const slots = await loadSlots(tx, open!.service_id, open!.staff_id, dayOf(open!.starts_at));
      const slot = slots.find((s) => s.session_id === open!.id && s.remaining > 0);
      expect(slot).toBeTruthy();
      // まだ取っていない生徒を探す
      const free = await q<{ id: string }>(tx, `select c.id from customers c where not exists (select 1 from reservations r where r.customer_id = c.id and r.status <> 'canceled' and local_day(r.starts_at) = local_day($1::timestamptz)) order by c.id limit 1`, [open!.starts_at]);
      const id = await reserveFor(tx, free[0].id, open!.service_id, slot!);
      const again = (await loadSessions(tx, dayOf(open!.starts_at), dayOf(open!.starts_at))).find((s) => s.id === open!.id)!;
      expect(again.booked).toBe(open!.booked + 1);
      await markVisited(tx, id);
      const due = await loadDue(tx, '2026-11-09');
      expect(Array.isArray(due)).toBe(true);
    });
    await resetDemo('salon');
  }, 120000);
});
