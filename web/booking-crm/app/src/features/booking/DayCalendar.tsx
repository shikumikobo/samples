'use client';
// 日にちを選ぶカレンダー（月ごと）。空きのある日だけ押せる。/book/time/ と /my/（日時の変更）で使う。
import { useMemo, useState } from 'react';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function DayCalendar({ availableDays, value, onPick }: { availableDays: string[]; value: string | null; onPick: (day: string) => void }) {
  const avail = useMemo(() => new Set(availableDays), [availableDays]);
  const first = availableDays[0];
  const last = availableDays[availableDays.length - 1];
  const start = value ?? first ?? ymd(2026, 0, 1);
  const [ym, setYm] = useState<[number, number]>([Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1]);
  const [y, m] = ym;
  const firstWd = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstWd).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const canPrev = !!first && ymd(y, m, 1) > first.slice(0, 8) + '01';
  const canNext = !!last && ymd(y, m, dim) < last;
  const move = (k: number) => setYm(([yy, mm]) => {
    const t = mm + k;
    return [yy + Math.floor(t / 12), ((t % 12) + 12) % 12];
  });

  return (
    <div className="bk-cal" role="group" aria-label="日にち">
      <div className="bk-cal-head">
        <button type="button" onClick={() => move(-1)} disabled={!canPrev} aria-label="前の月">‹</button>
        <strong>{y}年{m + 1}月</strong>
        <button type="button" onClick={() => move(1)} disabled={!canNext} aria-label="次の月">›</button>
      </div>
      <div className="bk-cal-grid">
        {WD.map((w, i) => (
          <span key={w} className={`bk-cal-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{w}</span>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <span key={`e${i}`} />;
          const day = ymd(y, m, d);
          const ok = avail.has(day);
          return (
            <button
              key={day}
              type="button"
              className={`bk-cal-day${i % 7 === 0 ? ' sun' : i % 7 === 6 ? ' sat' : ''}`}
              disabled={!ok}
              aria-pressed={day === value}
              aria-label={`${m + 1}月${d}日${ok ? '' : '（空きなし）'}`}
              onClick={() => onPick(day)}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="bk-cal-note">色のついた日が、予約できる日です。</p>
    </div>
  );
}
