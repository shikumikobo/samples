// お店側で、はじめての方（まだお客さん一覧にいない人）を登録して予約を入れるときの入力の確認。
// お客さん側（features/booking/validate.ts）より緩く、必須はお名前だけ。電話・メールは、入力されたときだけ形を確かめる。
export interface WalkIn {
  name: string;
  kana: string;
  phone: string;
  email: string;
}
export type WalkInErrors = Partial<Record<keyof WalkIn, string>>;
export const EMPTY_WALKIN: WalkIn = { name: '', kana: '', phone: '', email: '' };
/** お客さんの選択の、はじめての方の値 */
export const NEW_CUSTOMER = '__new__';

export function validateWalkIn(v: WalkIn): WalkInErrors {
  const e: WalkInErrors = {};
  if (!v.name.trim()) e.name = 'お名前を入力してください。';
  const digits = v.phone.replace(/[-\s]/g, '');
  if (digits && !/^0\d{9,10}$/.test(digits)) e.phone = '電話番号は、数字10〜11桁で入力してください（空でも構いません）。';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'メールアドレスの形が正しくありません（空でも構いません）。';
  return e;
}
