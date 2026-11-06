import { describe, expect, it } from 'vitest';
import { lineAmount, nextStatus, taxOf, totals } from './calc';

describe('見積の計算', () => {
  it('金額は数量×単価', () => {
    expect(lineAmount(200, 950)).toBe(190000);
    expect(lineAmount(1, 30000)).toBe(30000);
  });

  it('消費税は合計に1回、10%、切り捨て', () => {
    // 03 見積の見本（Q-2611-06-1）：税抜 869,500 → 消費税 86,950 → 税込 956,450
    const lines = [
      { qty: 200, unit_price: 950 },
      { qty: 150, unit_price: 250 },
      { qty: 150, unit_price: 3200 },
      { qty: 120, unit_price: 1100 },
      { qty: 1, unit_price: 30000 },
    ];
    expect(totals(lines)).toEqual({ subtotal: 869500, tax: 86950, total: 956450 });
  });

  it('端数は合計で切り捨てる（行ごとに税を出す方式にしない）', () => {
    const lines = [
      { qty: 1, unit_price: 15 },
      { qty: 1, unit_price: 15 },
    ];
    expect(totals(lines).tax).toBe(3); // 合計 30 の 10% ＝ 3（行ごとに切り捨てると 1+1=2 になってしまう）
  });

  it('小数の誤差が出ない', () => {
    expect(taxOf(956450)).toBe(95645);
    expect(taxOf(1999)).toBe(199);
    expect(taxOf(7)).toBe(0);
  });

  it('状況の流れは 下書き → 提出 → 承認', () => {
    expect(nextStatus('下書き')).toBe('提出');
    expect(nextStatus('提出')).toBe('承認');
    expect(nextStatus('承認')).toBeNull();
  });
});
