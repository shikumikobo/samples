'use client';
import { useState } from 'react';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/demo-date';
import { checkHours } from './lib';
import {
  addOff,
  loadHours,
  loadOff,
  loadServices,
  loadStaff,
  loadToday,
  removeOff,
  saveHours,
  saveService,
  type HoursRow,
  type ServiceRow,
  type StaffRow,
} from './queries';
import { COLORS, FONTS } from '@/lib/theme';
import { FlashView, LoadState, ShopPage, useAct, useShopLoad } from './ui';

const DAYS = [
  { wd: 1, label: '月' },
  { wd: 2, label: '火' },
  { wd: 3, label: '水' },
  { wd: 4, label: '木' },
  { wd: 5, label: '金' },
  { wd: 6, label: '土' },
  { wd: 0, label: '日' },
];

export function SettingsView() {
  const { words: w } = useApp();
  return (
    <ShopPage title={w.page_settings}>
      <SettingsBody />
    </ShopPage>
  );
}

function SettingsBody() {
  const { words: w, mode } = useApp();
  const { data, error, reload } = useShopLoad(async (tx) => {
    const today = await loadToday(tx);
    return { today, services: await loadServices(tx), staff: await loadStaff(tx), hours: await loadHours(tx), off: await loadOff(tx, today, null) };
  }, [mode]);
  const { act, flash, setFlash, busy } = useAct(reload);
  if (!data) return <LoadState error={error} loading />;

  return (
    <>
      <FlashView flash={flash} />
      <h2>{w.service}と料金</h2>
      <p className="sh-small">金額は内税です。変えても、すでに入っている予約の金額は変わりません。</p>
      <div className="card sh-tablewrap">
        <table className="sh-table sh-service">
          <thead>
            <tr>
              <th>名前</th><th>料金（円）</th><th>所要（分）</th><th>目安の日数</th><th>{w.trial}</th><th>初回限定</th><th>受付中</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <ServiceRowEdit key={`${s.id}-${s.name}-${s.price}-${s.duration_min}-${s.return_days}-${s.is_trial}-${s.first_time_only}-${s.active}`} s={s} busy={busy} onError={(t) => setFlash({ kind: 'err', text: t })} onSave={(x) => act((tx) => saveService(tx, x), `「${x.name}」を保存しました。`)} />
            ))}
          </tbody>
        </table>
      </div>

      <h2>営業時間（{w.staff}ごと）</h2>
      <div className="sh-cols sh-hours">
        {data.staff.map((s) => (
          <HoursEdit key={`${s.id}-${JSON.stringify(data.hours.filter((h) => h.staff_id === s.id))}`} staff={s} hours={data.hours.filter((h) => h.staff_id === s.id)} busy={busy} onError={(t) => setFlash({ kind: 'err', text: t })} onSave={(rows) => act((tx) => saveHours(tx, s.id, rows), `${s.name}の営業時間を保存しました。`)} />
        ))}
      </div>

      <h2>休み</h2>
      <OffEdit staff={data.staff} off={data.off} today={data.today} busy={busy} onAdd={(sid, d, n) => act((tx) => addOff(tx, sid, d, n), '休みを足しました。')} onRemove={(sid, d) => act((tx) => removeOff(tx, sid, d), '休みを消しました。')} onError={(t) => setFlash({ kind: 'err', text: t })} />

      <ThemeEdit />
    </>
  );
}

function ServiceRowEdit({ s, busy, onSave, onError }: { s: ServiceRow; busy: boolean; onSave: (s: ServiceRow) => void; onError: (t: string) => void }) {
  const [name, setName] = useState(s.name);
  const [price, setPrice] = useState(String(s.price));
  const [dur, setDur] = useState(String(s.duration_min));
  const [ret, setRet] = useState(s.return_days == null ? '' : String(s.return_days));
  const [trial, setTrial] = useState(s.is_trial);
  const [first, setFirst] = useState(s.first_time_only);
  const [active, setActive] = useState(s.active);
  const id = s.id;
  function submit() {
    const p = Number(price);
    const d = Number(dur);
    const r = ret === '' ? null : Number(ret);
    if (!name.trim()) return onError('名前を入れてください。');
    if (!Number.isInteger(p) || p < 0) return onError('料金は0以上の整数で入れてください。');
    if (!Number.isInteger(d) || d <= 0) return onError('所要時間は1以上の整数（分）で入れてください。');
    if (r != null && (!Number.isInteger(r) || r <= 0)) return onError('目安の日数は1以上の整数で入れてください。空にすると、連絡の一覧に出ません。');
    onSave({ ...s, name: name.trim(), price: p, duration_min: d, return_days: r, is_trial: trial, first_time_only: first, active });
  }
  return (
    <tr>
      <td><input type="text" aria-label={`${s.name}の名前`} value={name} onChange={(e) => setName(e.target.value)} /></td>
      <td><input type="number" inputMode="numeric" aria-label={`${s.name}の料金`} value={price} onChange={(e) => setPrice(e.target.value)} /></td>
      <td><input type="number" inputMode="numeric" aria-label={`${s.name}の所要時間`} value={dur} onChange={(e) => setDur(e.target.value)} disabled={s.kind === 'class'} title={s.kind === 'class' ? '枠の時間で決まります' : undefined} /></td>
      <td><input type="number" inputMode="numeric" aria-label={`${s.name}の目安の日数`} value={ret} onChange={(e) => setRet(e.target.value)} /></td>
      <td><input type="checkbox" aria-label={`${s.name}は体験`} checked={trial} onChange={(e) => setTrial(e.target.checked)} /></td>
      <td><input type="checkbox" aria-label={`${s.name}は初回限定`} checked={first} onChange={(e) => setFirst(e.target.checked)} /></td>
      <td><input type="checkbox" aria-label={`${s.name}は受付中`} checked={active} onChange={(e) => setActive(e.target.checked)} /></td>
      <td><button className="primary" disabled={busy} onClick={submit} aria-label={`${id}を保存`}>保存</button></td>
    </tr>
  );
}

function HoursEdit({ staff, hours, busy, onSave, onError }: { staff: StaffRow; hours: HoursRow[]; busy: boolean; onSave: (rows: { weekday: number; open_time: string; close_time: string }[]) => void; onError: (t: string) => void }) {
  const init = Object.fromEntries(DAYS.map((d) => {
    const h = hours.find((x) => x.weekday === d.wd);
    return [d.wd, { on: !!h, open: h?.open_time ?? '10:00', close: h?.close_time ?? '18:00' }];
  }));
  const [v, setV] = useState<Record<number, { on: boolean; open: string; close: string }>>(init);
  function submit() {
    const rows: { weekday: number; open_time: string; close_time: string }[] = [];
    for (const d of DAYS) {
      const x = v[d.wd];
      if (!x.on) continue;
      const bad = checkHours(x.open, x.close);
      if (bad) return onError(`${staff.name}の${d.label}曜：${bad}`);
      rows.push({ weekday: d.wd, open_time: x.open, close_time: x.close });
    }
    onSave(rows);
  }
  return (
    <section className="sh-col" aria-label={`${staff.name}の営業時間`}>
      <h3>{staff.name}<small>{staff.title}</small></h3>
      {DAYS.map((d) => (
        <div className="sh-hours-row" key={d.wd}>
          <label className="sh-check sh-day">
            <input type="checkbox" checked={v[d.wd].on} onChange={(e) => setV({ ...v, [d.wd]: { ...v[d.wd], on: e.target.checked } })} aria-label={`${staff.name} ${d.label}曜は営業`} />
            {d.label}
          </label>
          {v[d.wd].on ? (
            <>
              <input type="time" value={v[d.wd].open} aria-label={`${d.label}曜の開始`} onChange={(e) => setV({ ...v, [d.wd]: { ...v[d.wd], open: e.target.value } })} />
              〜
              <input type="time" value={v[d.wd].close} aria-label={`${d.label}曜の終了`} onChange={(e) => setV({ ...v, [d.wd]: { ...v[d.wd], close: e.target.value } })} />
            </>
          ) : (
            <span className="muted">休み</span>
          )}
        </div>
      ))}
      <button className="primary" disabled={busy} onClick={submit}>{staff.name}の営業時間を保存</button>
    </section>
  );
}

function OffEdit({ staff, off, today, busy, onAdd, onRemove, onError }: { staff: StaffRow[]; off: { staff_id: string; day: string; note: string }[]; today: string; busy: boolean; onAdd: (sid: string, day: string, note: string) => void; onRemove: (sid: string, day: string) => void; onError: (t: string) => void }) {
  const { words: w } = useApp();
  const [sid, setSid] = useState(staff[0]?.id ?? '');
  const [day, setDay] = useState(today);
  const [note, setNote] = useState('');
  return (
    <div className="card">
      <div className="sh-grid2">
        <label className="sh-field"><span>{w.staff}</span>
          <select value={sid} onChange={(e) => setSid(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="sh-field"><span>日付</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <label className="sh-field"><span>メモ（任意）</span><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <button className="primary" disabled={busy} onClick={() => (day && sid ? (onAdd(sid, day, note), setNote('')) : onError('日付を入れてください。'))}>休みを足す</button>
      <ul className="sh-list" style={{ marginTop: 8 }}>
        {off.map((o) => (
          <li key={`${o.staff_id}-${o.day}`}>
            <span className="grow">{formatDay(o.day)}　{staff.find((s) => s.id === o.staff_id)?.name}　<span className="sh-small">{o.note}</span></span>
            <button disabled={busy} onClick={() => onRemove(o.staff_id, o.day)}>消す</button>
          </li>
        ))}
        {off.length === 0 && <li>これからの休みはありません。</li>}
      </ul>
    </div>
  );
}

/** 見た目：色と見出しの書体。選ぶとすぐ画面に反映され、このブラウザの中に覚える（サロン・教室ごと） */
function ThemeEdit() {
  const { theme, setTheme, resetTheme, words: w } = useApp();
  return (
    <>
      <h2>見た目</h2>
      <div className="card">
        <p className="sh-small">{w.modeName}の画面の色と、見出しの書体を選べます。{w.customer}の画面にも反映されます。</p>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>色</legend>
          <div className="theme-pick">
            {COLORS.map((c) => (
              <label key={c.key}>
                <input type="radio" name="theme-color" checked={theme.color === c.key} onChange={() => setTheme({ color: c.key })} />
                <span className="dot" style={{ background: c.swatch }} aria-hidden="true" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>見出しの書体</legend>
          <div className="theme-pick">
            {FONTS.map((f) => (
              <label key={f.key}>
                <input type="radio" name="theme-font" checked={theme.font === f.key} onChange={() => setTheme({ font: f.key })} />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button onClick={resetTheme}>{w.modeName}の標準の見た目に戻す</button>
      </div>
    </>
  );
}
