import { describe, expect, it } from 'vitest';
import { dedupeAnyStaff, deadlineLabel, formatDuration, formatWhen, formatYen, groupByDay, isPastDeadline, nextStep, type Slot } from './format';
import { validateNewCustomer } from './validate';
import { BOOKING_WORDS } from './words';
import { ERROR_CODES } from '@/lib/errors';
import { WORDS } from '@/lib/words';

const slot = (staff: string, start: string, rem = 1, session: string | null = null): Slot => ({
  staff_id: staff,
  starts_at: `${start}:00+09:00`,
  ends_at: `${start}:00+09:00`,
  remaining: rem,
  session_id: session,
});

describe('整形', () => {
  it('金額・所要時間', () => {
    expect(formatYen(5500)).toBe('5,500円');
    expect(formatYen(0)).toBe('0円');
    expect(formatDuration(45)).toBe('45分');
    expect(formatDuration(120)).toBe('2時間');
    expect(formatDuration(150)).toBe('2時間30分');
  });
  it('日時は日本時間の文字列からそのまま作る', () => {
    expect(formatWhen('2026-11-10T10:30:00+09:00', '2026-11-10T12:00:00+09:00')).toBe('11月10日（火） 10:30〜12:00');
  });
});

describe('期限（前日の終わりまで）', () => {
  it('開始日の前日までは変えられ、当日以降は過ぎている', () => {
    expect(isPastDeadline('2026-11-10T10:00:00+09:00', '2026-11-09T09:00:00+09:00')).toBe(false);
    expect(isPastDeadline('2026-11-09T15:00:00+09:00', '2026-11-09T09:00:00+09:00')).toBe(true);
    expect(isPastDeadline('2026-11-08T15:00:00+09:00', '2026-11-09T09:00:00+09:00')).toBe(true);
  });
  it('期限の表示は前日', () => {
    expect(deadlineLabel('2026-11-10T10:00:00+09:00')).toBe('11月9日（月）の終わりまで');
  });
});

describe('空き枠の整理', () => {
  it('日ごとにまとめ、日付と時刻の順に並べる', () => {
    const g = groupByDay([slot('s2', '2026-11-11T10:00'), slot('s1', '2026-11-10T14:00'), slot('s1', '2026-11-10T09:00')]);
    expect(g.map((x) => x.day)).toEqual(['2026-11-10', '2026-11-11']);
    expect(g[0].slots.map((s) => s.starts_at.slice(11, 16))).toEqual(['09:00', '14:00']);
  });
  it('おまかせでは、同じ時刻の複数の担当を1つにする（クラス枠はそのまま）', () => {
    const out = dedupeAnyStaff([slot('s1', '2026-11-10T09:00'), slot('s2', '2026-11-10T09:00'), slot('t1', '2026-11-10T10:00', 3, 'cs1'), slot('t2', '2026-11-10T10:00', 2, 'cs2')]);
    expect(out.map((s) => s.staff_id)).toEqual(['s1', 't1', 't2']);
  });
});

describe('初めてのお客さんの入力', () => {
  const ok = { name: '山田 花子', kana: '', phone: '090-0000-1234', email: 'hanako@example.com' };
  it('正しい入力は通る', () => {
    expect(validateNewCustomer(ok)).toEqual({});
    expect(validateNewCustomer({ ...ok, phone: '09000001234' })).toEqual({});
  });
  it('名前・電話・メールの足りない／おかしいところを指す', () => {
    const e = validateNewCustomer({ name: ' ', kana: '', phone: '123', email: 'abc' });
    expect(Object.keys(e).sort()).toEqual(['email', 'name', 'phone']);
    expect(validateNewCustomer({ ...ok, email: '' }).email).toContain('メール');
  });
});

describe('エラーのあと次にどうするか', () => {
  it('どのコードにも、次の行動の文がある', () => {
    for (const c of ERROR_CODES) expect(nextStep(c, { service: 'メニュー' }).text.length).toBeGreaterThan(5);
  });
  it('体験を使用済みなら、通常のサービスに戻す', () => {
    const s = nextStep('TRIAL_USED', { service: 'コース' });
    expect(s.text).toContain('コース');
    expect(s.href).toBe('/book/');
  });
  it('期限切れは画面の移動先を出さず、お店への連絡を案内する', () => {
    const s = nextStep('DEADLINE_PASSED', { service: 'メニュー' });
    expect(s.href).toBeNull();
    expect(s.text).toContain('お店');
  });
});

describe('言葉（サロンと教室を混ぜない）', () => {
  it('お客さん側の言葉の辞書は、サロンと教室で同じキーがそろい、片方の言葉が混ざらない', () => {
    expect(Object.keys(BOOKING_WORDS.salon).sort()).toEqual(Object.keys(BOOKING_WORDS.class).sort());
    expect(Object.values(BOOKING_WORDS.class).join(' ')).not.toMatch(/予約|メニュー|お客さん/);
    expect(Object.values(BOOKING_WORDS.salon).join(' ')).not.toMatch(/申込み|コース|生徒|講師/);
  });
  it('画面の文に使う共通の辞書の言葉が引ける', () => {
    expect(WORDS.class.service).toBe('コース');
    expect(WORDS.salon.staff).toBe('担当');
  });
});
