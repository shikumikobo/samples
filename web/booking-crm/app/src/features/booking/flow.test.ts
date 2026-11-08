// @vitest-environment node
// 実際の db/*.sql と seed を流した DB で、お客さん側の流れ（予約→変更→キャンセル、体験の二重予約、満席への変更）を通す。
// 画面と同じ api.ts の関数を、withRole('customer', id, …) の中で呼ぶ。
import { describe, expect, it } from 'vitest';
import { q, resetDemo, withRole } from '@/lib/db';
import { errorCode } from '@/lib/errors';
import { PhoneTakenError, cancelReservation, changeSlot, findCustomerByPhone, listMine, listServices, listStaff, loadSlots, registerCustomer, reserveSlot, type ServiceRow } from './api';
import { isPastDeadline, type Slot } from './format';

let seq = 0;
async function newCustomer(): Promise<string> {
  seq += 1;
  return withRole('shop', null, (tx) => registerCustomer(tx, { name: `テスト ${seq}`, kana: '', phone: `080-9999-${String(seq).padStart(4, '0')}`, email: `t${seq}@example.com` }));
}
const as = <T>(id: string, fn: Parameters<typeof withRole<T>>[2]) => withRole('customer', id, fn);
async function fail(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return errorCode(e);
  }
  return null;
}
const firstDayAfter = (slots: Slot[], day: string) => slots.filter((s) => s.starts_at.slice(0, 10) >= day);

describe('サロン：予約→変更→キャンセル', () => {
  it('一覧にメニューと担当が出て、画像のファイル名と料金が付いている', async () => {
    await resetDemo('salon');
    const c = await newCustomer();
    const services = await as(c, (tx) => listServices(tx));
    expect(services.length).toBeGreaterThanOrEqual(6);
    expect(services.filter((s) => s.is_trial)).toHaveLength(1);
    for (const s of services) {
      expect(s.image).toMatch(/\.png$/);
      expect(s.price).toBeGreaterThanOrEqual(0);
    }
    expect((await as(c, (tx) => listStaff(tx))).length).toBe(3);
  }, 60000);

  it('空き枠から予約し、日時を変え、キャンセルできる。履歴は残り、同じ番号のまま', async () => {
    const c = await newCustomer();
    const svc = (await as(c, (tx) => listServices(tx))).find((s) => !s.is_trial && s.kind === 'timed')!;
    const slots = firstDayAfter(await as(c, (tx) => loadSlots(tx, svc.id, null)), '2026-11-11');
    expect(slots.length).toBeGreaterThan(10);
    const a = slots[0];
    const b = slots.find((s) => s.starts_at.slice(0, 10) !== a.starts_at.slice(0, 10))!;

    const id = await as(c, (tx) => reserveSlot(tx, c, svc.id, a));
    let mine = await as(c, (tx) => listMine(tx));
    expect(mine.map((r) => r.id)).toEqual([id]);
    expect(mine[0]).toMatchObject({ status: 'booked', starts_at: a.starts_at, staff_id: a.staff_id });

    // 予約した枠は、他の人からは出なくなる
    const after = await as(c, (tx) => loadSlots(tx, svc.id, a.staff_id));
    expect(after.some((s) => s.starts_at === a.starts_at)).toBe(false);

    await as(c, (tx) => changeSlot(tx, id, b));
    mine = await as(c, (tx) => listMine(tx));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id, status: 'booked', starts_at: b.starts_at, staff_id: b.staff_id });
    // 元の枠は空いた
    expect((await as(c, (tx) => loadSlots(tx, svc.id, a.staff_id))).some((s) => s.starts_at === a.starts_at)).toBe(true);

    await as(c, (tx) => cancelReservation(tx, id));
    mine = await as(c, (tx) => listMine(tx));
    expect(mine[0].status).toBe('canceled');
    const hist = await as(c, (tx) => q<{ action: string }>(tx, 'select action from history order by id'));
    expect(hist.map((h) => h.action)).toEqual(['create', 'change', 'cancel']);
  }, 60000);

  it('他の人の予約は見えず、変更・キャンセルもできない', async () => {
    const x = await newCustomer();
    const y = await newCustomer();
    const svc = (await as(x, (tx) => listServices(tx))).find((s) => !s.is_trial)!;
    const slot = firstDayAfter(await as(x, (tx) => loadSlots(tx, svc.id, null)), '2026-11-12')[0];
    const id = await as(x, (tx) => reserveSlot(tx, x, svc.id, slot));
    expect(await as(y, (tx) => listMine(tx))).toEqual([]);
    expect(await fail(as(y, (tx) => cancelReservation(tx, id)))).toMatch(/NOT_FOUND|FORBIDDEN/);
    expect(await fail(as(y, (tx) => reserveSlot(tx, x, svc.id, slot)))).toBe('FORBIDDEN');
  }, 60000);

  it('体験（初回限定）の二重予約は TRIAL_USED で断られ、同じメールアドレスの別の登録でも断られる', async () => {
    const c = await newCustomer();
    const trial = (await as(c, (tx) => listServices(tx))).find((s) => s.is_trial)!;
    const slots = firstDayAfter(await as(c, (tx) => loadSlots(tx, trial.id, null)), '2026-11-11');
    await as(c, (tx) => reserveSlot(tx, c, trial.id, slots[0]));
    const other = slots.find((s) => s.starts_at.slice(0, 10) !== slots[0].starts_at.slice(0, 10))!;
    expect(await fail(as(c, (tx) => reserveSlot(tx, c, trial.id, other)))).toBe('TRIAL_USED');
    // 電話番号は別でも、メールアドレスが同じなら、同じ人として扱われる
    const again = await withRole('shop', null, (tx) => registerCustomer(tx, { name: '別名', kana: '', phone: '080-8888-0001', email: `t${seq}@example.com` }));
    expect(await fail(as(again, (tx) => reserveSlot(tx, again, trial.id, other)))).toBe('TRIAL_USED');
  }, 60000);

  it('はじめての方の登録：同じ電話番号（ハイフン・空白の違いも）は PHONE_TAKEN で、すでにいる人の id が分かる。電話が空なら確認しない', async () => {
    const c = await newCustomer();
    const phone = `080-9999-${String(seq).padStart(4, '0')}`;
    const reg = (v: { name: string; phone: string }) => withRole('shop', null, (tx) => registerCustomer(tx, { kana: '', email: '', ...v }));
    for (const p of [phone, phone.replace(/-/g, ''), phone.replace(/-/g, ' ')]) {
      try {
        await reg({ name: '同じ電話', phone: p });
        throw new Error('登録できてしまった');
      } catch (e) {
        expect(errorCode(e)).toBe('PHONE_TAKEN');
        expect(e).toBeInstanceOf(PhoneTakenError);
        expect((e as PhoneTakenError).existingId).toBe(c);
      }
    }
    expect(await withRole('shop', null, (tx) => findCustomerByPhone(tx, phone))).toMatchObject({ id: c, name: expect.stringContaining('テスト') });
    // 電話が空の人は、何人でも登録できる（お店側の任意入力）
    const a = await reg({ name: '電話なし1', phone: '' });
    const b = await reg({ name: '電話なし2', phone: '' });
    expect(a).not.toBe(b);
    expect(await withRole('shop', null, (tx) => findCustomerByPhone(tx, ''))).toBeNull();
  }, 60000);

  it('お客さんのキャンセルの理由は、お店のメモに「【お客さんの理由】」つきで残り、お客さんの一覧には出ない', async () => {
    const c = await newCustomer();
    const svc = (await as(c, (tx) => listServices(tx))).find((s) => !s.is_trial)!;
    const slot = firstDayAfter(await as(c, (tx) => loadSlots(tx, svc.id, null)), '2026-11-11')[0];
    const id = await as(c, (tx) => reserveSlot(tx, c, svc.id, slot));
    await as(c, (tx) => cancelReservation(tx, id, '体調・都合'));
    const note = (await withRole('shop', null, (tx) => q<{ note: string }>(tx, `select note from reservations where id = $1`, [id])))[0]?.note;
    expect(note).toBe('【お客さんの理由】体調・都合');
    expect(JSON.stringify(await as(c, (tx) => listMine(tx)))).not.toContain('体調');
  }, 60000);

  it('同じ日の3件目は DAY_LIMIT、直前の枠は一覧に出ない', async () => {
    const c = await newCustomer();
    const svc = (await as(c, (tx) => listServices(tx))).find((s) => !s.is_trial && s.duration_min <= 90)!;
    const day = '2026-11-13';
    const slots = (await as(c, (tx) => loadSlots(tx, svc.id, null))).filter((s) => s.starts_at.startsWith(day));
    const picks: Slot[] = [];
    for (const s of slots) if (picks.every((p) => p.ends_at <= s.starts_at)) picks.push(s);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    await as(c, (tx) => reserveSlot(tx, c, svc.id, picks[0]));
    await as(c, (tx) => reserveSlot(tx, c, svc.id, picks[1]));
    expect(await fail(as(c, (tx) => reserveSlot(tx, c, svc.id, picks[2])))).toBe('DAY_LIMIT');
    // デモの今は 09:00。直前（2時間前まで）より前の枠は出ない
    const today = (await as(c, (tx) => loadSlots(tx, svc.id, null))).filter((s) => s.starts_at.startsWith('2026-11-09'));
    expect(today.every((s) => s.starts_at.slice(11, 16) >= '11:00')).toBe(true);
  }, 60000);

  it('当日の予約は期限（前日まで）を過ぎていて、変更・キャンセルは DEADLINE_PASSED。画面の判定と一致する', async () => {
    const c = await newCustomer();
    const svc = (await as(c, (tx) => listServices(tx))).find((s) => !s.is_trial && s.duration_min <= 90)!;
    const todaySlot = (await as(c, (tx) => loadSlots(tx, svc.id, null))).find((s) => s.starts_at.startsWith('2026-11-09'))!;
    const id = await as(c, (tx) => reserveSlot(tx, c, svc.id, todaySlot));
    expect(await fail(as(c, (tx) => cancelReservation(tx, id)))).toBe('DEADLINE_PASSED');
    const other = firstDayAfter(await as(c, (tx) => loadSlots(tx, svc.id, null)), '2026-11-12')[0];
    expect(await fail(as(c, (tx) => changeSlot(tx, id, other)))).toBe('DEADLINE_PASSED');
    expect((await as(c, (tx) => listMine(tx)))[0]).toMatchObject({ status: 'booked', starts_at: todaySlot.starts_at });
    expect(isPastDeadline(todaySlot.starts_at, '2026-11-09T09:00:00+09:00')).toBe(true);
  }, 60000);
});

describe('教室：残り人数と満席への変更', () => {
  it('枠ごとの残り人数が出て、満席は remaining=0 で返る。満席の枠への変更は失敗して元のまま', async () => {
    await resetDemo('class');
    const c = await newCustomer();
    const services = await as(c, (tx) => listServices(tx));
    let svc: ServiceRow | undefined;
    let sessions: Slot[] = [];
    for (const cand of services.filter((s) => !s.is_trial && s.kind === 'class')) {
      const open = firstDayAfter(await as(c, (tx) => loadSlots(tx, cand.id, null)), '2026-11-10').filter((s) => s.remaining > 0);
      if (open.length >= 2) {
        svc = cand;
        sessions = open;
        break;
      }
    }
    expect(svc).toBeTruthy();
    const service = svc!;
    const a = sessions[0]; // 自分が最初に取る枠
    const target = sessions.find((s) => s.session_id !== a.session_id)!;

    const id = await as(c, (tx) => reserveSlot(tx, c, service.id, a));
    const left = (await as(c, (tx) => loadSlots(tx, service.id, null))).find((s) => s.session_id === a.session_id)!;
    expect(left.remaining).toBe(a.remaining - 1);

    // target を満席にする
    const fillers: { who: string; rid: string }[] = [];
    for (let i = 0; i < target.remaining; i++) {
      const o = await newCustomer();
      fillers.push({ who: o, rid: await as(o, (tx) => reserveSlot(tx, o, service.id, target)) });
    }
    const full = (await as(c, (tx) => loadSlots(tx, service.id, null))).find((s) => s.session_id === target.session_id)!;
    expect(full.remaining).toBe(0);

    expect(await fail(as(c, (tx) => changeSlot(tx, id, full)))).toBe('SLOT_FULL');
    const mine = await as(c, (tx) => listMine(tx));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id, status: 'booked', session_id: a.session_id, starts_at: a.starts_at });
    // 元の枠の人数も減っていない
    const still = (await as(c, (tx) => loadSlots(tx, service.id, null))).find((s) => s.session_id === a.session_id)!;
    expect(still.remaining).toBe(a.remaining - 1);

    // 満席の枠で1人がキャンセルすると、同じ変更が通り、元の枠の人数が戻る
    await as(fillers[0].who, (tx) => cancelReservation(tx, fillers[0].rid));
    await as(c, (tx) => changeSlot(tx, id, full));
    expect((await as(c, (tx) => listMine(tx)))[0]).toMatchObject({ id, session_id: target.session_id });
    expect((await as(c, (tx) => loadSlots(tx, service.id, null))).find((s) => s.session_id === a.session_id)!.remaining).toBe(a.remaining);
  }, 90000);

  it('教室の体験も初回限定で、二重に取れない', async () => {
    const c = await newCustomer();
    const trial = (await as(c, (tx) => listServices(tx))).find((s) => s.is_trial)!;
    const sessions = firstDayAfter(await as(c, (tx) => loadSlots(tx, trial.id, null)), '2026-11-11').filter((s) => s.remaining > 0);
    await as(c, (tx) => reserveSlot(tx, c, trial.id, sessions[0]));
    const another = sessions.find((s) => s.session_id !== sessions[0].session_id)!;
    expect(await fail(as(c, (tx) => reserveSlot(tx, c, trial.id, another)))).toBe('TRIAL_USED');
  }, 60000);
});
