import { describe, expect, it } from 'vitest';
import { busyAt, cellState, cellsFor, fits, gridRows, gridWindow, inSelection, isBusyStart, minToHm, selectionLabel, toMin, type GridInput } from './grid';
import { EMPTY_WALKIN, validateWalkIn } from './walkin';

const T = (hm: string) => `2026-11-12T${hm}:00+09:00`;

// 2026-11-12（木）：a は 10:00〜19:00、b は 12:00〜20:00、c は休み
const base: GridInput = {
  day: '2026-11-12',
  staff: [
    { id: 'a', name: 'A', title: '' },
    { id: 'b', name: 'B', title: '' },
    { id: 'c', name: 'C', title: '' },
  ],
  hours: [
    { staff_id: 'a', open_time: '10:00', close_time: '19:00' },
    { staff_id: 'b', open_time: '12:00', close_time: '20:00' },
    { staff_id: 'c', open_time: '10:00', close_time: '18:00' },
  ],
  off: [{ staff_id: 'c', note: '研修' }],
  busy: [{ id: 'r1', staff_id: 'a', starts_at: T('11:00'), ends_at: T('12:30'), customer_id: 'c01', customer_name: '青木 香織' }],
  notBefore: T('00:00'),
  lastDay: '2026-12-31',
};

describe('時間の計算', () => {
  it('分と時刻の変換', () => {
    expect(toMin('10:15')).toBe(615);
    expect(minToHm(615)).toBe('10:15');
    expect(minToHm(540)).toBe('09:00');
  });
  it('所要時間ぶんのセル数は15分単位で切り上げ', () => {
    expect(cellsFor(60)).toBe(4);
    expect(cellsFor(45)).toBe(3);
    expect(cellsFor(50)).toBe(4);
    expect(cellsFor(5)).toBe(1);
  });
});

describe('表の範囲と行', () => {
  it('休みでない担当の、いちばん早い開始〜いちばん遅い終了', () => {
    // c は休みなので数えない。a=10:00〜19:00、b=12:00〜20:00 → 10:00〜20:00
    expect(gridWindow(base)).toEqual({ from: 600, to: 1200 });
  });
  it('15分に丸める', () => {
    const w = gridWindow({ ...base, off: [], hours: [{ staff_id: 'a', open_time: '10:10', close_time: '18:50' }] });
    expect(w).toEqual({ from: 600, to: 1140 });
  });
  it('誰も開いていなければ null、行は空', () => {
    const w = gridWindow({ ...base, off: [{ staff_id: 'a', note: '' }, { staff_id: 'b', note: '' }, { staff_id: 'c', note: '' }] });
    expect(w).toBeNull();
    expect(gridRows(w)).toEqual([]);
  });
  it('行は15分刻みで、終了の15分前まで', () => {
    expect(gridRows({ from: 600, to: 660 })).toEqual([600, 615, 630, 645]);
  });
});

describe('セルの状態', () => {
  it('休み・営業時間外・予約あり・空き', () => {
    expect(cellState(base, 'c', toMin('10:00'))).toBe('off');
    expect(cellState(base, 'b', toMin('11:45'))).toBe('closed'); // b は12:00から
    expect(cellState(base, 'a', toMin('18:45'))).toBe('free'); // 18:45〜19:00 は営業時間の中
    expect(cellState(base, 'a', toMin('19:00'))).toBe('closed');
    expect(cellState(base, 'a', toMin('11:00'))).toBe('busy');
    expect(cellState(base, 'a', toMin('12:15'))).toBe('busy'); // 12:30 まで
    expect(cellState(base, 'a', toMin('12:30'))).toBe('free');
    expect(cellState(base, 'a', toMin('10:45'))).toBe('free');
  });
  it('営業時間のない曜日の担当は、営業時間外', () => {
    expect(cellState({ ...base, hours: [] }, 'a', toMin('10:00'))).toBe('closed');
  });
  it('直前・先すぎは、受付できない時間', () => {
    const late = { ...base, notBefore: T('13:00') };
    expect(cellState(late, 'a', toMin('12:30'))).toBe('late');
    expect(cellState(late, 'a', toMin('13:00'))).toBe('free');
    expect(cellState({ ...base, lastDay: '2026-11-11' }, 'a', toMin('10:00'))).toBe('late');
  });
  it('予約があれば、直前でも「予約あり」のまま', () => {
    expect(cellState({ ...base, notBefore: T('23:00') }, 'a', toMin('11:00'))).toBe('busy');
  });
  it('予約の変更では、自分自身の予約は埋まりに数えない', () => {
    expect(cellState({ ...base, excludeId: 'r1' }, 'a', toMin('11:00'))).toBe('free');
    expect(busyAt({ ...base, excludeId: 'r1' }, 'a', toMin('11:00'))).toBeUndefined();
  });
  it('別の日の予約は数えない', () => {
    const other = { ...base, busy: [{ ...base.busy[0], starts_at: '2026-11-13T11:00:00+09:00', ends_at: '2026-11-13T12:00:00+09:00' }] };
    expect(cellState(other, 'a', toMin('11:00'))).toBe('free');
  });
  it('名前は予約の最初の行だけに出す', () => {
    const b = base.busy[0];
    expect(isBusyStart(b, toMin('11:00'), toMin('10:00'))).toBe(true);
    expect(isBusyStart(b, toMin('11:15'), toMin('10:00'))).toBe(false);
    expect(isBusyStart(b, toMin('10:00'), toMin('11:30'))).toBe(false);
  });
});

describe('所要時間ぶんが空いているか', () => {
  it('60分：空いていれば選べる', () => {
    expect(fits(base, 'a', toMin('12:30'), 60)).toEqual({ ok: true });
    expect(fits(base, 'a', toMin('10:00'), 60)).toEqual({ ok: true }); // 10:00〜11:00 で予約の直前まで
  });
  it('予約にかかるときは選べず、理由が出る', () => {
    const f = fits(base, 'a', toMin('10:15'), 60);
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toContain('予約');
  });
  it('営業時間の終わりをまたぐときは選べない', () => {
    expect(fits(base, 'a', toMin('18:00'), 60)).toEqual({ ok: true });
    const f = fits(base, 'a', toMin('18:15'), 60);
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toContain('営業時間');
  });
  it('休みの担当は選べない', () => {
    const f = fits(base, 'c', toMin('10:00'), 30);
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toContain('休み');
  });
  it('45分は3セル', () => {
    expect(fits(base, 'a', toMin('12:30'), 45)).toEqual({ ok: true });
    expect(fits(base, 'a', toMin('10:30'), 45).ok).toBe(false); // 11:00 に予約
    expect(fits(base, 'a', toMin('10:15'), 45)).toEqual({ ok: true }); // 10:15〜11:00
  });
});

describe('選んだ範囲', () => {
  it('開始から所要時間ぶんのセルが、選んだ範囲', () => {
    const sel = { staffId: 'a', start: toMin('12:30') };
    expect(selectionLabel(sel, 60)).toBe('12:30〜13:30');
    expect(inSelection(sel, 'a', toMin('12:30'), 60)).toBe(true);
    expect(inSelection(sel, 'a', toMin('13:15'), 60)).toBe(true);
    expect(inSelection(sel, 'a', toMin('13:30'), 60)).toBe(false);
    expect(inSelection(sel, 'b', toMin('12:30'), 60)).toBe(false);
    expect(inSelection(null, 'a', toMin('12:30'), 60)).toBe(false);
  });
});

describe('はじめての方の入力（お店側は名前だけ必須）', () => {
  it('名前がなければ、お名前のエラー', () => {
    expect(validateWalkIn(EMPTY_WALKIN).name).toBeTruthy();
    expect(validateWalkIn({ ...EMPTY_WALKIN, name: '  ' }).name).toBeTruthy();
  });
  it('名前だけで通る（電話・メールは空でよい）', () => {
    expect(validateWalkIn({ ...EMPTY_WALKIN, name: '山田 花子' })).toEqual({});
  });
  it('電話・メールは、入力されたときだけ形を確かめる', () => {
    expect(validateWalkIn({ name: 'a', kana: '', phone: '123', email: '' }).phone).toBeTruthy();
    expect(validateWalkIn({ name: 'a', kana: '', phone: '090-1234-5678', email: '' })).toEqual({});
    expect(validateWalkIn({ name: 'a', kana: '', phone: '', email: 'abc' }).email).toBeTruthy();
    expect(validateWalkIn({ name: 'a', kana: '', phone: '', email: 'a@b.jp' })).toEqual({});
  });
});
