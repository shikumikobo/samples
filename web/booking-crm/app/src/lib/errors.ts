// DB の関数のエラー（メッセージの先頭がコード。docs/contract.md の4章）を、画面の日本語の文に直す。
export const ERROR_CODES = [
  'SLOT_FULL',
  'OUT_OF_HOURS',
  'TOO_LATE',
  'TOO_FAR',
  'DAY_LIMIT',
  'TRIAL_USED',
  'DEADLINE_PASSED',
  'NOT_FOUND',
  'FORBIDDEN',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_TEXT: Record<ErrorCode, string> = {
  SLOT_FULL: 'この枠は埋まっています。ほかの日時を選んでください。',
  OUT_OF_HOURS: '営業時間・休みの外の日時です。ほかの日時を選んでください。',
  TOO_LATE: '直前のため、この日時はネットから取れません。2時間より先の枠を選んでください。',
  TOO_FAR: '先すぎる日付のため、まだ取れません。60日先までの日付を選んでください。',
  DAY_LIMIT: '同じ日に取れる予約は2件までです。',
  TRIAL_USED: '初回限定の体験は、すでにご利用済みです。',
  DEADLINE_PASSED: '変更・キャンセルの期限（前日の終わり）を過ぎています。お店にご連絡ください。',
  NOT_FOUND: '該当するデータが見つかりません。',
  FORBIDDEN: 'この操作はできません。',
};

/** エラー（または文字列）の先頭のコードを取り出す。コードがなければ null */
export function errorCode(e: unknown): ErrorCode | null {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const m = msg.match(/^\s*(?:error:\s*)?([A-Z_]+)/i);
  if (m && (ERROR_CODES as readonly string[]).includes(m[1].toUpperCase())) return m[1].toUpperCase() as ErrorCode;
  // 先頭でなくても、メッセージの中にコードがあれば拾う
  return ERROR_CODES.find((c) => msg.includes(c)) ?? null;
}

/** 画面に出す文。コードが分かれば日本語の文、分からなければ一般的な文 */
export function errorMessage(e: unknown): string {
  const c = errorCode(e);
  return c ? ERROR_TEXT[c] : '処理できませんでした。もう一度お試しください。';
}
