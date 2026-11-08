// お店側の画面で足りない言葉。lib/words.ts（担当 B）の辞書にないぶんを、ここでサロン／教室別に持つ。
import type { Mode, Words } from '@/lib/words';

export interface ShopWords {
  rsv: string; // 予約／申込み
  newRsv: string;
  noRsv: string;
  people: string; // 参加者の呼び方
}
export const SHOP_WORDS: Record<Mode, ShopWords> = {
  salon: { rsv: '予約', newRsv: '予約を入れる', noRsv: '予約はありません', people: 'お客さん' },
  class: { rsv: '申込み', newRsv: '申込みを入れる', noRsv: '申込みはありません', people: '参加者' },
};
export function statusLabel(w: Pick<Words, 'booked' | 'visited' | 'canceled' | 'noshow'>, s: string): string {
  return ({ booked: w.booked, visited: w.visited, canceled: w.canceled, noshow: w.noshow } as Record<string, string>)[s] ?? s;
}
