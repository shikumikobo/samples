import { describe, expect, it } from 'vitest';
import { WORDS } from '@/lib/words';
import { SHOP_WORDS } from './words';
import {
  buildContactMessage,
  checkHours,
  countDay,
  describeHistory,
  filterCustomers,
  groupBy,
  mdhm,
  range,
  trialKind,
  weekDays,
  weekStart,
  type CustomerRow,
} from './lib';

const cust = (o: Partial<CustomerRow>): CustomerRow => ({ id: 'c', name: '', kana: '', phone: '', has_caution: false, visits: 0, last_visit: null, had_trial: false, has_regular: false, ...o });

describe('日付・表示', () => {
  it('週は月曜はじまり（日曜は前の週に入る）', () => {
    expect(weekStart('2026-11-09')).toBe('2026-11-09'); // 月
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // 日
    expect(weekDays('2026-11-11')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  });
  it('時刻の表示', () => {
    expect(range('2026-11-09T10:00:00+09:00', '2026-11-09T11:30:00+09:00')).toBe('10:00〜11:30');
    expect(mdhm('2026-11-09T09:05:00+09:00')).toBe('11/9 09:05');
  });
  it('groupBy', () => {
    const g = groupBy([{ k: 'a' }, { k: 'b' }, { k: 'a' }], (x) => x.k);
    expect(g.get('a')?.length).toBe(2);
  });
});

describe('今日の件数', () => {
  it('キャンセルを数えず、体験の件数も出す', () => {
    const c = countDay([
      { status: 'booked', is_trial: true },
      { status: 'visited', is_trial: false },
      { status: 'noshow', is_trial: false },
      { status: 'canceled', is_trial: true },
    ]);
    expect(c).toEqual({ total: 3, booked: 1, visited: 1, noshow: 1, trial: 1 });
  });
});

describe('お客さんの絞り込み', () => {
  const list = [
    cust({ id: '1', name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-0000-1111', had_trial: true }),
    cust({ id: '2', name: '佐藤 太郎', kana: 'サトウ タロウ', phone: '090-0000-2222', had_trial: true, has_regular: true }),
    cust({ id: '3', name: '鈴木 次郎', kana: 'スズキ ジロウ', phone: '090-0000-3333', has_regular: true }),
  ];
  it('体験のみ／体験から通常に来た を見分ける', () => {
    expect(list.map(trialKind)).toEqual(['trial_only', 'converted', 'none']);
    expect(filterCustomers(list, '', 'trial_only').map((c) => c.id)).toEqual(['1']);
    expect(filterCustomers(list, '', 'converted').map((c) => c.id)).toEqual(['2']);
  });
  it('名前・読み・電話（ハイフンなし）で探せる', () => {
    expect(filterCustomers(list, '佐藤', 'all').map((c) => c.id)).toEqual(['2']);
    expect(filterCustomers(list, 'ススキ', 'all')).toEqual([]);
    expect(filterCustomers(list, 'スズキ', 'all').map((c) => c.id)).toEqual(['3']);
    expect(filterCustomers(list, '09000001111', 'all').map((c) => c.id)).toEqual(['1']);
    expect(filterCustomers(list, '0000-2222', 'all').map((c) => c.id)).toEqual(['2']);
  });
});

describe('連絡の文', () => {
  const input = { name: '山田 花子', serviceName: 'ワンカラージェル', lastVisit: '2026-09-28', shopName: 'ネイルサロン ひなた' };
  it('サロンは来店・予約の言葉', () => {
    const t = buildContactMessage('salon', input);
    expect(t).toContain('山田 花子さま');
    expect(t).toContain('9月28日');
    expect(t).toContain('ご来店');
    expect(t).not.toMatch(/出席|生徒|講師/);
  });
  it('教室は出席・申込みの言葉', () => {
    const t = buildContactMessage('class', { ...input, serviceName: '和食の基本', shopName: '料理教室 まるいち' });
    expect(t).toContain('ご出席');
    expect(t).toContain('お申込み');
    expect(t).not.toMatch(/来店|予約|お客さん/);
  });
});

describe('変更の履歴の表示', () => {
  it('変更は 前 → 後 を出す', () => {
    const d = describeHistory(
      { id: 1, at: '2026-11-09T09:00:00+09:00', actor: 'shop', action: 'change', reservation_id: 'R1', before: { starts_at: '2026-11-10T10:00:00+09:00' }, after: { starts_at: '2026-11-12T14:00:00+09:00' } },
      WORDS.salon,
      SHOP_WORDS.salon.rsv,
    );
    expect(d.detail).toBe('11/10 10:00 → 11/12 14:00');
    expect(d.who).toBe('お店');
    expect(d.what).toContain('予約');
  });
  it('お客さん本人の操作と、来店の言葉（教室は出席）', () => {
    const h = { id: 2, at: '2026-11-09T09:00:00+09:00', actor: 'customer:c01', action: 'visit', reservation_id: 'R1', before: null, after: { starts_at: '2026-11-09T10:00:00+09:00' } };
    expect(describeHistory(h, WORDS.class, SHOP_WORDS.class.rsv)).toMatchObject({ who: '生徒本人', what: '出席済み' });
  });
});

describe('営業時間の入力', () => {
  it('終了が開始より後でないと拒む', () => {
    expect(checkHours('10:00', '18:00')).toBeNull();
    expect(checkHours('18:00', '10:00')).toContain('後');
    expect(checkHours('', '10:00')).toContain('時刻');
  });
});

describe('お店側の言葉（サロンと教室を混ぜない）', () => {
  it('教室の言葉に、サロンの言葉が入らない', () => {
    const t = Object.values(SHOP_WORDS.class).join(' ');
    expect(t).not.toMatch(/予約|お客さん|来店/);
    const s = Object.values(SHOP_WORDS.salon).join(' ');
    expect(s).not.toMatch(/申込み|参加者|出席/);
  });
});
