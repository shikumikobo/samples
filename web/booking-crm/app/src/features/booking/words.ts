// お客さん側の画面で使う言葉のうち、共通の辞書（lib/words.ts）にまだ無いもの。サロンと教室で分け、画面に混ぜない。
// 共通の辞書に足されたら、そちらに移す（docs/contract.md「変更の依頼」）。
import type { Mode } from '@/lib/words';

export interface BookingWords {
  reservation: string; // 予約／申込み
  anyStaff: string; // おまかせ
  trialLabel: string; // 初回限定
  change: string;
  cancel: string;
  upcoming: string;
  history: string;
  noUpcoming: string;
  noHistory: string;
}

const salon: BookingWords = {
  reservation: '予約',
  anyStaff: 'おまかせ',
  trialLabel: '初回限定',
  change: '日時を変更する',
  cancel: '予約をキャンセルする',
  upcoming: 'これからの予約',
  history: '履歴',
  noUpcoming: 'これからの予約はありません。',
  noHistory: '履歴はまだありません。',
};
const klass: BookingWords = {
  reservation: '申込み',
  anyStaff: 'おまかせ',
  trialLabel: '初回限定',
  change: '日時を変更する',
  cancel: '申込みをキャンセルする',
  upcoming: 'これからの申込み',
  history: '履歴',
  noUpcoming: 'これからの申込みはありません。',
  noHistory: '履歴はまだありません。',
};
export const BOOKING_WORDS: Record<Mode, BookingWords> = { salon, class: klass };
export const bookingWords = (m: Mode) => BOOKING_WORDS[m];
