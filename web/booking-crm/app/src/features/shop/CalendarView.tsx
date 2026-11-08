'use client';
import { useState } from 'react';
import { useApp } from '@/lib/app-state';
import { addDays, formatDay } from '@/lib/demo-date';
import { byTime, countDay, dayOf, groupBy, range, weekDays, yen, type Rsv } from './lib';
import { SHOP_WORDS, statusLabel } from './words';
import {
  cancelReservation,
  changeTo,
  loadCustomers,
  loadOff,
  loadReservations,
  loadServices,
  loadSessions,
  loadStaff,
  loadToday,
  markNoshow,
  markVisited,
  reserveFor,
  type OffRow,
  type ServiceRow,
  type SessionRow,
  type StaffRow,
} from './queries';
import { FlashView, LoadState, ShopPage, SlotPicker, StatusBadge, useAct, useShopLoad } from './ui';

type View = 'day' | 'week';

export function CalendarView() {
  const { words: w } = useApp();
  return (
    <ShopPage title={w.page_calendar}>
      <CalendarBody />
    </ShopPage>
  );
}

function CalendarBody() {
  const { words: w, mode } = useApp();
  const sw = SHOP_WORDS[mode];
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const base = useShopLoad(async (tx) => ({ today: await loadToday(tx), staff: await loadStaff(tx), services: await loadServices(tx, true) }), [mode]);
  const cur = date ?? base.data?.today ?? null;
  const days = cur ? (view === 'week' ? weekDays(cur) : [cur]) : [];
  const from = days[0];
  const to = days[days.length - 1];

  const cal = useShopLoad(
    async (tx) => {
      if (!from) return null;
      return {
        rs: await loadReservations(tx, from, to),
        sessions: mode === 'class' ? await loadSessions(tx, from, to) : [],
        off: await loadOff(tx, from, to),
      };
    },
    [from, to, mode],
  );
  const { act, flash, setFlash, busy } = useAct(cal.reload);

  if (!base.data || !cur) return <LoadState error={base.error} loading />;
  const { today, staff, services } = base.data;
  const shown = (cal.data?.rs ?? []).filter((r) => r.status !== 'canceled' && (!staffFilter || r.staff_id === staffFilter));
  const sel = cal.data?.rs.find((r) => r.id === selected) ?? null;
  const move = (n: number) => setDate(addDays(cur, view === 'week' ? n * 7 : n));
  const c = countDay(shown);

  return (
    <>
      <div className="sh-bar">
        <div className="seg" role="group" aria-label="表示の切り替え" style={{ background: 'var(--pri-soft)' }}>
          {(['day', 'week'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'day' ? '日' : '週'}
            </button>
          ))}
        </div>
        <button onClick={() => move(-1)} aria-label={view === 'week' ? '前の週' : '前の日'}>◀</button>
        <button onClick={() => setDate(today)}>今日</button>
        <button onClick={() => move(1)} aria-label={view === 'week' ? '次の週' : '次の日'}>▶</button>
        <input type="date" value={cur} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="日付" />
        <label className="sh-field inline grow">
          <span>{w.staff}</span>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
            <option value="">全員</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button className="primary" onClick={() => { setCreating(true); setSelected(null); }}>＋ {sw.newRsv}</button>
      </div>
      <p className="lead">
        <strong>{view === 'week' ? `${formatDay(days[0])}〜${formatDay(days[6])}` : formatDay(cur)}</strong>
        　{c.total}件{c.trial > 0 && `（${w.trial} ${c.trial}件）`}
      </p>
      <FlashView flash={flash} />
      <LoadState error={cal.error} loading={!cal.data} />

      {creating && (
        <CreatePanel
          services={services}
          staff={staff}
          day={cur < today ? today : cur}
          busy={busy}
          onClose={() => setCreating(false)}
          onCreate={async (cid, svc, slot) => {
            const ok = await act((tx) => reserveFor(tx, cid, svc, slot), `${sw.rsv}を入れました。`);
            if (ok) {
              setCreating(false);
              setDate(slot.starts_at.slice(0, 10));
            }
          }}
        />
      )}
      {sel && (
        <EditPanel
          key={sel.id}
          r={sel}
          staff={staff}
          services={services}
          busy={busy}
          onClose={() => setSelected(null)}
          act={act}
          setFlash={setFlash}
        />
      )}

      {cal.data && (view === 'day' ? (
        <DayColumns day={cur} staff={staff.filter((s) => !staffFilter || s.id === staffFilter)} rs={shown} sessions={cal.data.sessions} off={cal.data.off} selected={selected} onSelect={(id) => { setSelected(id); setCreating(false); }} />
      ) : (
        <WeekColumns days={days} staff={staff} rs={shown} sessions={cal.data.sessions.filter((s) => !staffFilter || s.staff_id === staffFilter)} off={cal.data.off} selected={selected} onSelect={(id) => { setSelected(id); setCreating(false); }} onDay={(d) => { setDate(d); setView('day'); }} />
      ))}
    </>
  );
}

// ── 日：担当ごとの列（狭い画面では縦に並ぶ） ──
function DayColumns({ day, staff, rs, sessions, off, selected, onSelect }: { day: string; staff: StaffRow[]; rs: Rsv[]; sessions: SessionRow[]; off: OffRow[]; selected: string | null; onSelect: (id: string) => void }) {
  const { words: w, mode } = useApp();
  const sw = SHOP_WORDS[mode];
  return (
    <div className="sh-cols">
      {staff.map((s) => {
        const mine = byTime(rs.filter((r) => r.staff_id === s.id));
        const isOff = off.find((o) => o.staff_id === s.id && o.day === day);
        const mySessions = sessions.filter((x) => x.staff_id === s.id);
        return (
          <section className="sh-col" key={s.id} aria-label={`${w.staff}：${s.name}`}>
            <h3>{s.name}<small>{s.title}</small></h3>
            {isOff && <p className="sh-off">休み{isOff.note && `：${isOff.note}`}</p>}
            {mode === 'class' ? (
              mySessions.length === 0 ? <p className="muted">枠はありません。</p> :
              mySessions.map((ss) => (
                <div className="sh-session" key={ss.id}>
                  <header>
                    <strong className="num">{range(ss.starts_at, ss.ends_at)}</strong>
                    <span>{ss.service_name}</span>
                    <span className="badge">参加 {ss.booked}/{ss.capacity}</span>
                  </header>
                  {mine.filter((r) => r.session_id === ss.id).map((r) => <Item key={r.id} r={r} selected={selected === r.id} onSelect={onSelect} hideTime />)}
                  {ss.booked === 0 && <p className="muted">{sw.noRsv}。</p>}
                </div>
              ))
            ) : mine.length === 0 ? (
              <p className="muted">{sw.noRsv}。</p>
            ) : (
              mine.map((r) => <Item key={r.id} r={r} selected={selected === r.id} onSelect={onSelect} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── 週：日ごとの列。中の行に担当を出す ──
function WeekColumns({ days, staff, rs, sessions, off, selected, onSelect, onDay }: { days: string[]; staff: StaffRow[]; rs: Rsv[]; sessions: SessionRow[]; off: OffRow[]; selected: string | null; onSelect: (id: string) => void; onDay: (d: string) => void }) {
  const { mode } = useApp();
  const sw = SHOP_WORDS[mode];
  const byDay = groupBy(rs, (r) => dayOf(r.starts_at));
  return (
    <div className="sh-week">
      {days.map((d) => {
        const list = byTime(byDay.get(d) ?? []);
        const offs = off.filter((o) => o.day === d);
        const ss = sessions.filter((x) => dayOf(x.starts_at) === d);
        return (
          <section className="sh-col" key={d} aria-label={formatDay(d)}>
            <h3><button onClick={() => onDay(d)} style={{ minHeight: 44 }} aria-label={`${formatDay(d)}を日表示で開く`}>{formatDay(d)}</button></h3>
            {offs.map((o) => <p className="sh-off" key={o.staff_id}>{staff.find((s) => s.id === o.staff_id)?.name}：休み</p>)}
            {mode === 'class' && ss.map((x) => {
              const members = list.filter((r) => r.session_id === x.id);
              return (
                <div className="sh-session" key={x.id}>
                  <header>
                    <strong className="num">{range(x.starts_at, x.ends_at)}</strong>
                    <span>{staff.find((s) => s.id === x.staff_id)?.name}</span>
                    <span className="badge">{x.booked}/{x.capacity}</span>
                  </header>
                  {members.map((r) => <Item key={r.id} r={r} selected={selected === r.id} onSelect={onSelect} hideTime />)}
                </div>
              );
            })}
            {mode !== 'class' && list.map((r) => <Item key={r.id} r={r} selected={selected === r.id} onSelect={onSelect} showStaff />)}
            {list.length === 0 && ss.length === 0 && <p className="muted">{sw.noRsv}。</p>}
          </section>
        );
      })}
    </div>
  );
}

function Item({ r, selected, onSelect, hideTime, showStaff }: { r: Rsv; selected: boolean; onSelect: (id: string) => void; hideTime?: boolean; showStaff?: boolean }) {
  const { words: w } = useApp();
  return (
    <div className={`sh-item ${selected ? 'sel' : ''} ${r.status === 'visited' ? 'done' : ''}`}>
      <button className="open" onClick={() => onSelect(r.id)} aria-label={`${r.customer_name} ${range(r.starts_at, r.ends_at)} を開く`}>
        <span className="row">
          {!hideTime && <span className="t">{range(r.starts_at, r.ends_at)}</span>}
          <strong>{r.customer_name}</strong>
          {r.status !== 'booked' && <StatusBadge r={r} label={statusLabel(w, r.status)} />}
          {r.is_trial && <span className="sh-trial">{w.trial}</span>}
        </span>
        <span className="sub">{r.service_name}{showStaff && `　${r.staff_name}`}</span>
      </button>
    </div>
  );
}

type Act = ReturnType<typeof useAct>['act'];

// ── 予約の変更・キャンセル・来店 ──
function EditPanel({ r, staff, services, busy, onClose, act, setFlash }: { r: Rsv; staff: StaffRow[]; services: ServiceRow[]; busy: boolean; onClose: () => void; act: Act; setFlash: ReturnType<typeof useAct>['setFlash'] }) {
  const { words: w, mode } = useApp();
  const sw = SHOP_WORDS[mode];
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const svc = services.find((s) => s.id === r.service_id);
  const editable = r.status === 'booked';
  return (
    <section className="sh-panel" aria-label={`${sw.rsv}の内容`}>
      <header>
        <h2>{r.customer_name}　<StatusBadge r={r} label={statusLabel(w, r.status)} /></h2>
        <button onClick={onClose}>閉じる</button>
      </header>
      <p>
        <span className="num">{formatDay(dayOf(r.starts_at))} {range(r.starts_at, r.ends_at)}</span>　{r.staff_name}<br />
        {r.service_name}　{yen(r.price)}　{r.is_trial && <span className="sh-trial">{w.trial}</span>}
      </p>
      <p className="sh-small">お店の人は、期限（前日の終わり）を過ぎた{sw.rsv}も変更・キャンセルできます。</p>
      {editable ? (
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => act((tx) => markVisited(tx, r.id), `${w.visited}にしました。`)}>{w.visited}</button>
          <button disabled={busy} onClick={() => act((tx) => markNoshow(tx, r.id), `${w.noshow}にしました。`)}>{w.noshow}</button>
          <button disabled={busy} onClick={() => setShowChange((x) => !x)} aria-expanded={showChange}>日時・{w.staff}を変更</button>
          {confirmCancel ? (
            <>
              <button className="danger" disabled={busy} onClick={async () => { if (await act((tx) => cancelReservation(tx, r.id), `${sw.rsv}をキャンセルしました。`)) onClose(); }}>キャンセルする</button>
              <button onClick={() => setConfirmCancel(false)}>やめる</button>
            </>
          ) : (
            <button className="danger" disabled={busy} onClick={() => setConfirmCancel(true)}>{sw.rsv}をキャンセル</button>
          )}
        </div>
      ) : (
        <p className="muted">この{sw.rsv}は変更できません（{statusLabel(w, r.status)}）。</p>
      )}
      {editable && showChange && (
        <>
          <h2>新しい日時を選ぶ</h2>
          <SlotPicker
            service={svc}
            staff={staff}
            staffId={null}
            initialDay={dayOf(r.starts_at)}
            actionLabel="変更先"
            disabled={busy}
            onPick={async (slot) => {
              setFlash(null);
              if (await act((tx) => changeTo(tx, r.id, slot), `${sw.rsv}を変更しました。`)) setShowChange(false);
            }}
          />
        </>
      )}
    </section>
  );
}

// ── 予約の作成（電話受付：お客さんを選んで入れる） ──
function CreatePanel({ services, staff, day, busy, onClose, onCreate }: { services: ServiceRow[]; staff: StaffRow[]; day: string; busy: boolean; onClose: () => void; onCreate: (customerId: string, serviceId: string, slot: { staff_id: string; starts_at: string; session_id: string | null }) => void }) {
  const { words: w, mode } = useApp();
  const sw = SHOP_WORDS[mode];
  const customers = useShopLoad((tx) => loadCustomers(tx), []);
  const [q, setQ] = useState('');
  const [cid, setCid] = useState('');
  const [sid, setSid] = useState(services[0]?.id ?? '');
  const [stf, setStf] = useState('');
  const list = (customers.data ?? []).filter((c) => !q || c.name.includes(q) || c.kana.includes(q) || c.phone.replace(/-/g, '').includes(q.replace(/-/g, '')));
  const svc = services.find((s) => s.id === sid);
  return (
    <section className="sh-panel" aria-label={sw.newRsv}>
      <header>
        <h2>{sw.newRsv}</h2>
        <button onClick={onClose}>閉じる</button>
      </header>
      <div className="sh-grid2">
        <label className="sh-field">
          <span>{w.customer}を探す（名前・電話）</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="sh-field">
          <span>{w.customer}</span>
          <select value={cid} onChange={(e) => setCid(e.target.value)}>
            <option value="">選んでください</option>
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.phone}）</option>)}
          </select>
        </label>
        <label className="sh-field">
          <span>{w.service}</span>
          <select value={sid} onChange={(e) => setSid(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}（{yen(s.price)}）</option>)}
          </select>
        </label>
        <label className="sh-field">
          <span>{w.staff}</span>
          <select value={stf} onChange={(e) => setStf(e.target.value)}>
            <option value="">指定なし</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {!cid && <p className="muted">先に{w.customer}を選ぶと、日時を選べます。</p>}
      {cid && (
        <SlotPicker key={`${sid}-${stf}`} service={svc} staff={staff} staffId={stf || null} initialDay={day} actionLabel="この日時で入れる" disabled={busy} onPick={(slot) => onCreate(cid, sid, slot)} />
      )}
    </section>
  );
}
