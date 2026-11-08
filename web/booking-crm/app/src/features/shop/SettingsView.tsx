'use client';
import { useState } from 'react';
import { withRole } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { PRESET_IMAGES, fileToDataUrl, imageSrc } from '@/lib/images';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/demo-date';
import { checkHours } from './lib';
import {
  addOff,
  addDays,
  addService,
  addSessions,
  loadSessions,
  removeSession,
  updateSession,
  type SessionInput,
  type SessionRow,
  addStaff,
  deactivateStaff,
  saveStaff,
  removeService,
  serviceUseCount,
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
    return { today, services: await loadServices(tx), staff: await loadStaff(tx), hours: await loadHours(tx), off: await loadOff(tx, today, null), sessions: mode === 'class' ? await loadSessions(tx, today, addDays(today, 180)) : [] };
  }, [mode]);
  const { act, flash, setFlash, busy } = useAct(reload);
  if (!data) return <LoadState error={error} loading />;

  async function removeOne(s: ServiceRow) {
    try {
      const n = await withRole('shop', null, (tx) => serviceUseCount(tx, s.id));
      if (n > 0) return setFlash({ kind: 'err', text: `「${s.name}」は予約が${n}件入っているので消せません。「受付中」を外すと、${w.customer}の画面から隠せます。` });
      if (!window.confirm(`「${s.name}」を消します。元に戻せません。よろしいですか？`)) return;
      await act((tx) => removeService(tx, s.id), `「${s.name}」を消しました。`);
    } catch (e) {
      setFlash({ kind: 'err', text: errorMessage(e) });
    }
  }

  return (
    <>
      <FlashView flash={flash} />
      <h2>{w.service}と料金</h2>
      <p className="sh-small">金額は内税です。変えても、すでに入っている予約の金額は変わりません。</p>
      <div className="card sh-tablewrap">
        <table className="sh-table sh-service">
          <thead>
            <tr>
              <th>画像</th><th>名前</th><th>料金（円）</th><th>所要（分）</th><th>目安の日数</th><th>{w.trial}</th><th>初回限定</th><th>受付中</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <ServiceRowEdit key={`${s.id}-${s.name}-${s.price}-${s.duration_min}-${s.return_days}-${s.is_trial}-${s.first_time_only}-${s.active}-${(s.image ?? '').slice(0, 40)}`} s={s} busy={busy} onRemove={() => removeOne(s)} onError={(t) => setFlash({ kind: 'err', text: t })} onSave={(x) => act((tx) => saveService(tx, x), `「${x.name}」を保存しました。`)} />
            ))}
          </tbody>
        </table>
      </div>

      <ServiceAdd busy={busy} onError={(t) => setFlash({ kind: 'err', text: t })} onAdd={(x) => act((tx) => addService(tx, x), `「${x.name}」を足しました。`)} />

      {mode === 'class' && (
        <SessionsEdit
          services={data.services.filter((x) => x.kind === 'class')}
          staff={data.staff}
          sessions={data.sessions}
          today={data.today}
          busy={busy}
          onError={(t) => setFlash({ kind: 'err', text: t })}
          onAdd={async (x, n) => {
            try {
              const r = await withRole('shop', null, (tx) => addSessions(tx, x, n));
              const sk = r.skipped ? `（${r.skipped}回は、同じ担当の別の枠と重なるか休みの日なので、飛ばしました）` : '';
              setFlash({ kind: r.added ? 'ok' : 'err', text: r.added ? `開催日を${r.added}回ぶん足しました。${sk}` : `足せませんでした。同じ担当の別の枠と重なるか、担当の休みの日です。` });
              reload();
            } catch (e) {
              setFlash({ kind: 'err', text: errorMessage(e) });
            }
          }}
          onSave={async (id, x, booked) => {
            try {
              const msg = await withRole('shop', null, (tx) => updateSession(tx, id, x, booked));
              setFlash(msg ? { kind: 'err', text: msg } : { kind: 'ok', text: '開催日を保存しました。' });
              if (!msg) reload();
            } catch (e) {
              setFlash({ kind: 'err', text: errorMessage(e) });
            }
          }}
          onRemove={async (sess) => {
            if (!window.confirm(`${sess.starts_at.slice(0, 10)} の「${sess.service_name}」を消します。よろしいですか？`)) return;
            try {
              const msg = await withRole('shop', null, (tx) => removeSession(tx, sess.id));
              setFlash(msg ? { kind: 'err', text: msg } : { kind: 'ok', text: '開催日を消しました。' });
              if (!msg) reload();
            } catch (e) {
              setFlash({ kind: 'err', text: errorMessage(e) });
            }
          }}
        />
      )}

      <h2>営業時間（{w.staff}ごと）</h2>
      <div className="sh-cols sh-hours">
        {data.staff.map((s) => (
          <HoursEdit key={`${s.id}-${JSON.stringify(data.hours.filter((h) => h.staff_id === s.id))}`} staff={s} hours={data.hours.filter((h) => h.staff_id === s.id)} busy={busy} onError={(t) => setFlash({ kind: 'err', text: t })} onSave={(rows) => act((tx) => saveHours(tx, s.id, rows), `${s.name}の営業時間を保存しました。`)} onSaveProfile={(n, t) => act((tx) => saveStaff(tx, s.id, n, t), `${n}の情報を保存しました。`)} onRemove={() => { if (window.confirm(`${s.name}を外します。予約の画面と表から消えます（入っている予約と履歴は残ります）。よろしいですか？`)) void act((tx) => deactivateStaff(tx, s.id), `${s.name}を外しました。`); }} />
        ))}
      </div>
      <StaffAdd busy={busy} onError={(t) => setFlash({ kind: 'err', text: t })} onAdd={(n, t) => act((tx) => addStaff(tx, n, t), `${n}を足しました。営業時間は月〜金 10:00〜18:00 から始まります。`)} />

      <h2>休み</h2>
      <OffEdit staff={data.staff} off={data.off} today={data.today} busy={busy} onAdd={(sid, d, n) => act((tx) => addOff(tx, sid, d, n), '休みを足しました。')} onRemove={(sid, d) => act((tx) => removeOff(tx, sid, d), '休みを消しました。')} onError={(t) => setFlash({ kind: 'err', text: t })} />

      <ThemeEdit />
    </>
  );
}

function ServiceRowEdit({ s, busy, onSave, onError, onRemove }: { s: ServiceRow; busy: boolean; onSave: (s: ServiceRow) => void; onError: (t: string) => void; onRemove: () => void }) {
  const [image, setImage] = useState(s.image);
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
    onSave({ ...s, name: name.trim(), price: p, duration_min: d, return_days: r, is_trial: trial, first_time_only: first, active, image });
  }
  return (
    <tr>
      <td><ImagePick image={image} onChange={setImage} onError={onError} label={s.name} /></td>
      <td><input type="text" aria-label={`${s.name}の名前`} value={name} onChange={(e) => setName(e.target.value)} /></td>
      <td><input type="number" inputMode="numeric" aria-label={`${s.name}の料金`} value={price} onChange={(e) => setPrice(e.target.value)} /></td>
      <td><input type="number" inputMode="numeric" aria-label={`${s.name}の所要時間`} value={dur} onChange={(e) => setDur(e.target.value)} disabled={s.kind === 'class'} title={s.kind === 'class' ? '枠の時間で決まります' : undefined} /></td>
      <td><input type="number" inputMode="numeric" aria-label={`${s.name}の目安の日数`} value={ret} onChange={(e) => setRet(e.target.value)} /></td>
      <td><input type="checkbox" aria-label={`${s.name}は体験`} checked={trial} onChange={(e) => setTrial(e.target.checked)} /></td>
      <td><input type="checkbox" aria-label={`${s.name}は初回限定`} checked={first} onChange={(e) => setFirst(e.target.checked)} /></td>
      <td><input type="checkbox" aria-label={`${s.name}は受付中`} checked={active} onChange={(e) => setActive(e.target.checked)} /></td>
      <td><button className="primary" disabled={busy} onClick={submit} aria-label={`${id}を保存`}>保存</button> <button disabled={busy} onClick={onRemove} aria-label={`${s.name}を消す`}>消す</button></td>
    </tr>
  );
}

/** メニューの画像：同梱の画像から選ぶか、自分の写真を選ぶ（ブラウザの中で小さくして保存） */
function ImagePick({ image, onChange, onError, label }: { image: string | null; onChange: (v: string | null) => void; onError: (t: string) => void; label: string }) {
  const { mode } = useApp();
  return (
    <div className="sh-img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc(image)} alt={`${label}の画像`} />
      <select aria-label={`${label}の画像を選ぶ`} value={image && !image.startsWith('data:') ? image : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
        <option value="">{image?.startsWith('data:') ? '自分の写真' : '画像を選ぶ'}</option>
        {PRESET_IMAGES.filter((p) => p.mode === mode).map((p) => <option key={p.file} value={p.file}>{p.label}</option>)}
      </select>
      <label className="sh-file">写真を選ぶ
        <input type="file" accept="image/*" aria-label={`${label}の写真を選ぶ`} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { onChange(await fileToDataUrl(f)); } catch (err) { onError(err instanceof Error ? err.message : '画像を読み込めませんでした。'); }
        }} />
      </label>
    </div>
  );
}

function ServiceAdd({ busy, onAdd, onError }: { busy: boolean; onAdd: (x: { name: string; kind: 'timed' | 'class'; price: number; duration_min: number; image: string | null }) => void; onError: (t: string) => void }) {
  const { words: w, mode } = useApp();
  const kind = mode === 'class' ? 'class' : 'timed';
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [dur, setDur] = useState('60');
  const [image, setImage] = useState<string | null>(PRESET_IMAGES.find((p) => p.mode === mode)?.file ?? null);
  function submit() {
    const p = Number(price);
    const d = Number(dur);
    if (!name.trim()) return onError('名前を入れてください。');
    if (price === '' || !Number.isInteger(p) || p < 0) return onError('料金は0以上の整数で入れてください。');
    if (!Number.isInteger(d) || d <= 0) return onError('所要時間は1以上の整数（分）で入れてください。');
    onAdd({ name: name.trim(), kind, price: p, duration_min: d, image });
    setName('');
    setPrice('');
  }
  return (
    <div className="card sh-service-add">
      <h3>{w.service}を足す</h3>
      <div className="sh-grid2">
        <label className="sh-field"><span>名前</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="sh-field"><span>料金（円）</span><input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="sh-field"><span>所要（分）</span><input type="number" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></label>
        <div className="sh-field"><span>画像</span><ImagePick image={image} onChange={setImage} onError={onError} label="追加する" /></div>
      </div>
      {kind === 'class' && <p className="sh-small">コースを足したら、下の「開催日」で日にちを足すと、お客さんの画面に出ます。</p>}
      <button className="primary" disabled={busy} onClick={submit}>{w.service}を足す</button>
    </div>
  );
}

function StaffAdd({ busy, onAdd, onError }: { busy: boolean; onAdd: (name: string, title: string) => void; onError: (t: string) => void }) {
  const { words: w } = useApp();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  return (
    <div className="card sh-staff-add">
      <h3>{w.staff}を足す</h3>
      <div className="sh-grid2">
        <label className="sh-field"><span>名前</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="sh-field"><span>肩書き</span><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      </div>
      <button className="primary" disabled={busy} onClick={() => (name.trim() ? (onAdd(name.trim(), title.trim()), setName(''), setTitle('')) : onError('名前を入れてください。'))}>{w.staff}を足す</button>
    </div>
  );
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const wdOf = (day: string) => WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()];

/** 教室の開催日：1回だけ、または毎週同じ曜日に何回か、をまとめて足す。足した日は一覧で直す・消す */
function SessionsEdit({ services, staff, sessions, today, busy, onAdd, onSave, onRemove, onError }: {
  services: ServiceRow[];
  staff: StaffRow[];
  sessions: SessionRow[];
  today: string;
  busy: boolean;
  onAdd: (x: SessionInput, count: number) => void;
  onSave: (id: string, x: SessionInput, booked: number) => void;
  onRemove: (s: SessionRow) => void;
  onError: (t: string) => void;
}) {
  const { words: w } = useApp();
  const [svc, setSvc] = useState(services[0]?.id ?? '');
  const [sid, setSid] = useState(staff[0]?.id ?? '');
  const [day, setDay] = useState(addDays(today, 7));
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('12:00');
  const [cap, setCap] = useState('6');
  const [count, setCount] = useState('1');
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 26;
  function submit() {
    const c = Number(cap);
    if (!svc) return onError(`${w.service}がありません。先に${w.service}を足してください。`);
    if (!day) return onError('日付を入れてください。');
    if (day < today) return onError('今日より前の日は入れられません。');
    const bad = checkHours(start, end);
    if (bad) return onError(bad);
    if (!Number.isInteger(c) || c <= 0) return onError('定員は1以上の整数で入れてください。');
    if (!valid) return onError('回数は1〜26の整数で入れてください。');
    onAdd({ service_id: svc, staff_id: sid, day, start, end, capacity: c }, n);
  }
  return (
    <>
      <h2>開催日</h2>
      <p className="sh-small">お客さんの画面に出る、教室の日にちです。「回数」を2以上にすると、同じ曜日に毎週、その回数ぶんまとめて足します。</p>
      <div className="card sh-session-add">
        <div className="sh-grid2">
          <label className="sh-field"><span>{w.service}</span>
            <select value={svc} onChange={(e) => setSvc(e.target.value)}>{services.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="sh-field"><span>{w.staff}</span>
            <select value={sid} onChange={(e) => setSid(e.target.value)}>{staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="sh-field"><span>はじめの日</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
          <label className="sh-field"><span>開始</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="sh-field"><span>終了</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <label className="sh-field"><span>定員（名）</span><input type="number" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          <label className="sh-field"><span>回数（毎週）</span><input type="number" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></label>
        </div>
        <p className="sh-small" aria-live="polite">
          {day && valid ? (n === 1 ? `${day}（${wdOf(day)}）の1回だけ足します。` : `${day}（${wdOf(day)}）から、毎週${wdOf(day)}曜に${n}回（最後は ${addDays(day, 7 * (n - 1))}）足します。`) : ''}
        </p>
        <button className="primary" disabled={busy || !svc} onClick={submit}>開催日を足す</button>
      </div>
      <div className="card sh-tablewrap">
        <table className="sh-table sh-sessions">
          <thead>
            <tr><th>日付</th><th>開始</th><th>終了</th><th>{w.service}</th><th>{w.staff}</th><th>定員</th><th>申込</th><th></th></tr>
          </thead>
          <tbody>
            {sessions.map((x) => (
              <SessionRowEdit key={`${x.id}-${x.starts_at}-${x.ends_at}-${x.staff_id}-${x.capacity}`} s={x} staff={staff} busy={busy} onSave={(v) => onSave(x.id, v, x.booked)} onRemove={() => onRemove(x)} onError={onError} />
            ))}
            {sessions.length === 0 && <tr><td colSpan={8}>これからの開催日はありません。</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SessionRowEdit({ s, staff, busy, onSave, onRemove, onError }: { s: SessionRow; staff: StaffRow[]; busy: boolean; onSave: (v: SessionInput) => void; onRemove: () => void; onError: (t: string) => void }) {
  const [day, setDay] = useState(s.starts_at.slice(0, 10));
  const [start, setStart] = useState(s.starts_at.slice(11, 16));
  const [end, setEnd] = useState(s.ends_at.slice(11, 16));
  const [sid, setSid] = useState(s.staff_id);
  const [cap, setCap] = useState(String(s.capacity));
  const label = `${s.starts_at.slice(0, 10)} ${s.service_name}`;
  function submit() {
    const c = Number(cap);
    const bad = checkHours(start, end);
    if (bad) return onError(bad);
    if (!day) return onError('日付を入れてください。');
    if (!Number.isInteger(c) || c <= 0) return onError('定員は1以上の整数で入れてください。');
    onSave({ service_id: s.service_id, staff_id: sid, day, start, end, capacity: c });
  }
  return (
    <tr>
      <td><input type="date" aria-label={`${label}の日付`} value={day} onChange={(e) => setDay(e.target.value)} /></td>
      <td><input type="time" aria-label={`${label}の開始`} value={start} onChange={(e) => setStart(e.target.value)} /></td>
      <td><input type="time" aria-label={`${label}の終了`} value={end} onChange={(e) => setEnd(e.target.value)} /></td>
      <td>{s.service_name}</td>
      <td><select aria-label={`${label}の担当`} value={sid} onChange={(e) => setSid(e.target.value)}>{staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
      <td><input type="number" inputMode="numeric" aria-label={`${label}の定員`} value={cap} onChange={(e) => setCap(e.target.value)} /></td>
      <td>{s.booked}名</td>
      <td><button className="primary" disabled={busy} onClick={submit} aria-label={`${label}を保存`}>保存</button> <button disabled={busy} onClick={onRemove} aria-label={`${label}を消す`}>消す</button></td>
    </tr>
  );
}

function HoursEdit({ staff, hours, busy, onSave, onSaveProfile, onRemove, onError }: { staff: StaffRow; hours: HoursRow[]; busy: boolean; onSave: (rows: { weekday: number; open_time: string; close_time: string }[]) => void; onSaveProfile: (name: string, title: string) => void; onRemove: () => void; onError: (t: string) => void }) {
  const { words: w } = useApp();
  const [editing, setEditing] = useState(false);
  const [pname, setPname] = useState(staff.name);
  const [ptitle, setPtitle] = useState(staff.title);
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
      <h3>{staff.name}<small>{staff.title}</small>
        <button type="button" className="sh-staff-edit" aria-label={`${staff.name}を編集`} aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? '閉じる' : '編集'}</button>
      </h3>
      {editing && (
        <div className="sh-staff-form">
          <label className="sh-field"><span>名前</span><input type="text" value={pname} onChange={(e) => setPname(e.target.value)} /></label>
          <label className="sh-field"><span>肩書き</span><input type="text" value={ptitle} onChange={(e) => setPtitle(e.target.value)} /></label>
          <div className="sh-staff-actions">
            <button className="primary" disabled={busy} onClick={() => (pname.trim() ? (onSaveProfile(pname.trim(), ptitle.trim()), setEditing(false)) : onError('名前を入れてください。'))}>名前と肩書きを保存</button>
            <button disabled={busy} onClick={onRemove}>この{w.staff}を外す</button>
          </div>
        </div>
      )}
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
