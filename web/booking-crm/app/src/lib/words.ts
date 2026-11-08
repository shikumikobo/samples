// サロン／教室の言葉の辞書。画面は直接日本語を書かず、ここを引く。1つの画面に2つのモードの言葉を混ぜない。
export type Mode = 'salon' | 'class';
export const MODES: Mode[] = ['salon', 'class'];

const salon = {
  modeName: 'サロン',
  shopName: 'ネイルサロン ひなた',
  service: 'メニュー',
  staff: '担当',
  customer: 'お客さん',
  shopSide: 'お店',
  visit: '来店',
  visited: '来店済み',
  book: '予約する',
  trial: '体験',
  return_list: '販売促進',
  return_desc: '前回の来店から、目安の日数が過ぎたお客さんです。',
  noshow: '無断欠席',
  booked: '予約済み',
  canceled: 'キャンセル',
  remaining: '空き',
  // 画面の題名
  page_home: 'ご利用の選択',
  page_book: 'メニューを選ぶ',
  page_book_time: '担当と日時を選ぶ',
  page_book_confirm: '予約内容の確認',
  page_book_done: '予約を受け付けました',
  page_my: '私の予約',
  page_today: '今日の予約',
  page_calendar: '予約表',
  page_customers: 'お客さん一覧',
  page_customer_detail: 'お客さんのカルテ',
  page_return: '販売促進',
  page_settings: 'メニュー・営業時間・休み',
  // 上の帯の項目
  nav_book: '予約する',
  nav_my: '私の予約',
  nav_today: '今日',
  nav_calendar: '予約表',
  nav_customers: 'お客さん',
  nav_return: '販売促進',
  nav_settings: '設定',
} as const;

export type Words = { [K in keyof typeof salon]: string };

const klass: Words = {
  modeName: '教室',
  shopName: '料理教室 まるいち',
  service: 'コース',
  staff: '講師',
  customer: '生徒',
  shopSide: 'お店',
  visit: '出席',
  visited: '出席済み',
  book: '申し込む',
  trial: '体験',
  return_list: '販売促進',
  return_desc: '前回の出席から、目安の日数が過ぎた生徒です。',
  noshow: '無断欠席',
  booked: '申込み済み',
  canceled: 'キャンセル',
  remaining: '残り',
  page_home: 'ご利用の選択',
  page_book: 'コースを選ぶ',
  page_book_time: '講師と日時を選ぶ',
  page_book_confirm: '申込み内容の確認',
  page_book_done: '申込みを受け付けました',
  page_my: '私の申込み',
  page_today: '今日のクラス',
  page_calendar: 'クラス表',
  page_customers: '生徒一覧',
  page_customer_detail: '生徒のカルテ',
  page_return: '販売促進',
  page_settings: 'コース・営業時間・休み',
  nav_book: '申し込む',
  nav_my: '私の申込み',
  nav_today: '今日',
  nav_calendar: 'クラス表',
  nav_customers: '生徒',
  nav_return: '販売促進',
  nav_settings: '設定',
};

export const WORDS: Record<Mode, Words> = { salon, class: klass };

export function getWords(mode: Mode): Words {
  return WORDS[mode];
}
