import { describe, expect, it } from 'vitest';
import { needsConfirmation, quoteTotals, yen } from './quote';

describe('quoteTotals', () => {
  it('消費税は合計に1回、切り捨て', () => {
    // 3 × 333 = 999、税は 99.9 → 99
    expect(quoteTotals([{ qty: 3, unit_price: 333 }])).toEqual({ subtotal: 999, tax: 99, total: 1098 });
  });
  it('行ごとに税を切り捨てずに合計してから切り捨てる', () => {
    const r = quoteTotals([{ qty: 1, unit_price: 15 }, { qty: 1, unit_price: 15 }]);
    expect(r.tax).toBe(3); // 行ごとなら 1+1=2
  });
  it('文字で来た数も計算できる（DB の numeric）', () => {
    expect(quoteTotals([{ qty: '200', unit_price: '950' }], '0.10').subtotal).toBe(190000);
  });
});

describe('表示', () => {
  it('円の表示', () => expect(yen(1234567)).toBe('¥1,234,567'));
  it('提出の見積だけ確認を求める', () => {
    expect(needsConfirmation('提出')).toBe(true);
    expect(needsConfirmation('承認')).toBe(false);
  });
});
