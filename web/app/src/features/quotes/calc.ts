// 見積の計算。金額 ＝ 数量 × 単価（円未満は四捨五入）。消費税は「合計に対して1回」・切り捨て。
export type Line = { qty: number; unit_price: number };

export const lineAmount = (qty: number, unitPrice: number): number => Math.round(Number(qty) * Number(unitPrice));

export function subtotal(lines: Line[]): number {
  return lines.reduce((sum, l) => sum + lineAmount(l.qty, l.unit_price), 0);
}

/** rate は 0.10 のような小数。整数の％にしてから計算して、小数の誤差を避ける。 */
export function taxOf(sub: number, rate = 0.1): number {
  return Math.floor((sub * Math.round(rate * 100)) / 100);
}

export function totals(lines: Line[], rate = 0.1) {
  const sub = subtotal(lines);
  const tax = taxOf(sub, rate);
  return { subtotal: sub, tax, total: sub + tax };
}

/** 状況の流れ：下書き → 提出 → 承認 */
export const QUOTE_FLOW = ['下書き', '提出', '承認'] as const;
export const nextStatus = (s: string): string | null => {
  const i = QUOTE_FLOW.indexOf(s as (typeof QUOTE_FLOW)[number]);
  return i >= 0 && i < QUOTE_FLOW.length - 1 ? QUOTE_FLOW[i + 1] : null;
};
