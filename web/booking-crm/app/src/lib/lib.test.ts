import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorCode, errorMessage } from './errors';
import { WORDS, MODES } from './words';
import { addDays, formatDay, getToday } from './demo-date';

describe('words', () => {
  it('サロンと教室で同じキーがそろっている', () => {
    expect(Object.keys(WORDS.class).sort()).toEqual(Object.keys(WORDS.salon).sort());
    for (const m of MODES) for (const v of Object.values(WORDS[m])) expect(v).not.toBe('');
  });
  it('契約の言葉（6章）が引ける', () => {
    expect(WORDS.salon.visited).toBe('来店済み');
    expect(WORDS.class.visited).toBe('出席済み');
    expect(WORDS.class.customer).toBe('生徒');
    expect(WORDS.class.staff).toBe('講師');
  });
  it('1つのモードの言葉に、もう片方の言葉が混ざらない', () => {
    const salonText = Object.values(WORDS.salon).join(' ');
    expect(salonText).not.toMatch(/講師|生徒|出席|コース/);
    const classText = Object.values(WORDS.class).join(' ');
    expect(classText).not.toMatch(/メニュー|来店|お客さん|担当|予約/);
  });
});

describe('errors', () => {
  it('コードから日本語の文になる', () => {
    expect(errorCode(new Error('SLOT_FULL: この枠は埋まっています'))).toBe('SLOT_FULL');
    expect(errorMessage(new Error('error: DEADLINE_PASSED'))).toContain('期限');
    for (const c of ERROR_CODES) expect(errorMessage(new Error(c))).not.toContain('処理できませんでした');
  });
  it('知らないエラーは一般の文', () => {
    expect(errorCode(new Error('boom'))).toBeNull();
    expect(errorMessage(new Error('boom'))).toContain('処理できませんでした');
  });
});

describe('demo-date', () => {
  it('今日は 2026-11-09（月）で固定', () => {
    expect(getToday()).toBe('2026-11-09');
    expect(formatDay(getToday())).toBe('11月9日（月）');
    expect(addDays('2026-11-09', 60)).toBe('2027-01-08');
  });
});
