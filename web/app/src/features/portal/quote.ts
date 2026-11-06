// お客さんに見せる見積の合計。金額＝数量×単価、消費税は合計に1回・切り捨て（社内の見積と同じ決まり）。
export type QuoteLine = { qty: number | string; unit_price: number | string };

export function quoteTotals(lines: QuoteLine[], taxRate: number | string = 0.1) {
  const subtotal = lines.reduce((sum, l) => sum + Math.round(Number(l.qty) * Number(l.unit_price)), 0);
  const tax = Math.floor(subtotal * Number(taxRate));
  return { subtotal, tax, total: subtotal + tax };
}

export const yen = (n: number | string) => `¥${Number(n).toLocaleString('ja-JP')}`;

/** 承認前（提出）の見積は、お客さんに「ご確認ください」を出す */
export const needsConfirmation = (status: string) => status === '提出';
