import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, weekDays, weekStart } from './week';

describe('週の計算', () => {
  it('水曜から月曜を出す', () => expect(weekStart('2026-11-11')).toBe('2026-11-09'));
  it('日曜は前の月曜の週', () => expect(weekStart('2026-11-15')).toBe('2026-11-09'));
  it('月曜はそのまま', () => expect(weekStart('2026-11-09')).toBe('2026-11-09'));
  it('月をまたぐ', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
  it('7日分', () => {
    const d = weekDays('2026-11-09');
    expect(d).toHaveLength(7);
    expect(d[6]).toBe('2026-11-15');
  });
  it('曜日つきの表示', () => expect(dayLabel('2026-11-09')).toBe('11/9（月）'));
});
