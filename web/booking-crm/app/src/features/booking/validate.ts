// 初めてのお客さんの入力の確認。
export interface NewCustomer {
  name: string;
  kana: string;
  phone: string;
  email: string;
}
export type NewCustomerErrors = Partial<Record<keyof NewCustomer, string>>;

export function validateNewCustomer(v: NewCustomer): NewCustomerErrors {
  const e: NewCustomerErrors = {};
  if (!v.name.trim()) e.name = 'お名前を入力してください。';
  const digits = v.phone.replace(/[-\s]/g, '');
  if (!digits) e.phone = '電話番号を入力してください。';
  else if (!/^0\d{9,10}$/.test(digits)) e.phone = '電話番号は、ハイフンありでもなしでも、数字10〜11桁で入力してください。';
  if (!v.email.trim()) e.email = 'メールアドレスを入力してください。';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'メールアドレスの形が正しくありません。';
  return e;
}
