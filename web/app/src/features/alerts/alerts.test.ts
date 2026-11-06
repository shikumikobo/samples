import { describe, expect, it } from 'vitest';
import { computeAlerts, daysBetween, type AlertSite } from './index';

const base: AlertSite = { id: 'S-1', name: '現場', status: '受付', staff_id: null, received_on: '2026-11-01', planned_start: null, planned_end: null };
const s = { today: '2026-11-06', unassignedDays: 3 };

describe('daysBetween', () => {
  it('月をまたいでも日数を数える', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-11-06', '2026-11-06')).toBe(0);
  });
});

describe('computeAlerts', () => {
  it('受付から3日以上で担当がなければ警告する', () => {
    const r = computeAlerts([base], s);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('unassigned');
    expect(r[0].days).toBe(5);
  });
  it('担当がいれば警告しない／3日未満なら警告しない', () => {
    expect(computeAlerts([{ ...base, staff_id: 'E-01' }], s)).toHaveLength(0);
    expect(computeAlerts([{ ...base, received_on: '2026-11-04' }], s)).toHaveLength(0);
    expect(computeAlerts([{ ...base, received_on: '2026-11-03' }], s)).toHaveLength(1);
  });
  it('着工予定日を過ぎても受注のままなら警告する（当日は警告しない）', () => {
    const late = { ...base, status: '受注', staff_id: 'E-01', planned_start: '2026-11-04' };
    expect(computeAlerts([late], s)[0].kind).toBe('start-late');
    expect(computeAlerts([{ ...late, planned_start: '2026-11-06' }], s)).toHaveLength(0);
  });
  it('完工予定日を過ぎても着工のままなら警告する', () => {
    const r = computeAlerts([{ ...base, status: '着工', staff_id: 'E-01', planned_end: '2026-11-01' }], s);
    expect(r[0].kind).toBe('finish-late');
    expect(r[0].days).toBe(5);
  });
  it('基準日を変えると結果が変わる', () => {
    expect(computeAlerts([base], { ...s, today: '2026-11-02' })).toHaveLength(0);
  });
  it('日数の大きい順に並べる', () => {
    const r = computeAlerts([base, { ...base, id: 'S-2', received_on: '2026-10-20' }], s);
    expect(r.map((x) => x.siteId)).toEqual(['S-2', 'S-1']);
  });
});
