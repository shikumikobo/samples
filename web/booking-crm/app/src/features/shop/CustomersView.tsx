'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/demo-date';
import { describeHistory, filterCustomers, range, trialKind, yen, type CustomerFilter } from './lib';
import { SHOP_WORDS, statusLabel } from './words';
import { cancelReservation, loadCustomer, loadCustomerReservations, loadCustomers, loadHistory, markNoshow, markVisited, saveKarte } from './queries';
import { FlashView, LoadState, ShopPage, StatusBadge, useAct, useShopLoad } from './ui';

export function CustomersView() {
  const { words: w } = useApp();
  return (
    <ShopPage title={w.page_customers}>
      <CustomersBody />
    </ShopPage>
  );
}

function CustomersBody() {
  const { words: w, mode } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useState<CustomerFilter>('all');
  const { data, error } = useShopLoad((tx) => loadCustomers(tx), [mode]);
  if (!data) return <LoadState error={error} loading />;
  const list = filterCustomers(data, q, f);
  return (
    <>
      <div className="sh-bar">
        <label className="sh-field grow">
          <span>名前・電話で探す</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：さくら、090" />
        </label>
        <label className="sh-field">
          <span>絞り込み</span>
          <select value={f} onChange={(e) => setF(e.target.value as CustomerFilter)}>
            <option value="all">すべて</option>
            <option value="trial_only">{w.trial}のみ</option>
            <option value="converted">{w.trial}から通常に来た</option>
          </select>
        </label>
      </div>
      <p className="muted">{list.length}人（全{data.length}人）</p>
      <div className="card sh-tablewrap">
        <ul className="sh-list">
          {list.map((c) => {
            const k = trialKind(c);
            return (
              <li key={c.id}>
                <span className="grow">
                  <Link className="link" href={`/customers/detail/?id=${c.id}`}><strong>{c.name}</strong></Link>
                  <span className="sh-small">　{c.kana}</span>
                </span>
                <span className="num">{c.phone}</span>
                <span className="sh-small">{w.visit} {c.visits}回{c.last_visit && `　最後 ${formatDay(c.last_visit)}`}</span>
                {k === 'trial_only' && <span className="sh-trial">{w.trial}のみ</span>}
                {k === 'converted' && <span className="sh-trial">{w.trial}から通常に来た</span>}
                {c.has_caution && <span className="sh-caution">注意あり</span>}
              </li>
            );
          })}
          {list.length === 0 && <li>該当する{w.customer}はいません。</li>}
        </ul>
      </div>
    </>
  );
}

// ── カルテ ──
export function CustomerDetailView() {
  const { words: w } = useApp();
  return (
    <ShopPage title={w.page_customer_detail}>
      <Suspense fallback={<p className="muted">読み込み中…</p>}>
        <DetailBody />
      </Suspense>
    </ShopPage>
  );
}

function DetailBody() {
  const id = useSearchParams().get('id');
  const { words: w, mode } = useApp();
  const sw = SHOP_WORDS[mode];
  const { data, error, reload } = useShopLoad(async (tx) => {
    if (!id) return null;
    const c = await loadCustomer(tx, id);
    if (!c) return { c: null as null };
    return { c, rs: await loadCustomerReservations(tx, id), hist: await loadHistory(tx, id) };
  }, [id]);
  const { act, flash, busy } = useAct(reload);
  if (!id) return <p className="card">{w.customer}が選ばれていません。<Link href="/customers/">一覧へ</Link></p>;
  if (!data) return <LoadState error={error} loading />;
  if (!data.c) return <p className="card">該当する{w.customer}が見つかりません。<Link href="/customers/">一覧へ</Link></p>;
  const { c, rs, hist } = data;
  const trialUsed = rs.some((r) => r.is_trial && (r.status === 'booked' || r.status === 'visited'));
  const regular = rs.some((r) => !r.is_trial && (r.status === 'booked' || r.status === 'visited'));
  const visits = rs.filter((r) => r.status === 'visited');

  return (
    <>
      <p><Link href="/customers/">← {w.page_customers}</Link></p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{c.name}　<small className="sh-small">{c.kana}</small></h2>
        <p>
          <span className="num">{c.phone}</span>　{c.email}
        </p>
        <p className="row">
          <span className="badge">{w.visit} {visits.length}回</span>
          {trialUsed && <span className="sh-trial">{w.trial}{regular ? 'から通常に来た' : 'のみ'}</span>}
        </p>
      </div>
      <FlashView flash={flash} />
      <KarteForm key={`${c.id}-${c.note}-${c.caution}`} note={c.note} caution={c.caution} busy={busy} onSave={(n, ca) => act((tx) => saveKarte(tx, c.id, n, ca), 'カルテを保存しました。')} />

      <h2>{sw.rsv}と{w.visit}の履歴</h2>
      <div className="card sh-tablewrap">
        <ul className="sh-list">
          {rs.map((r) => (
            <li key={r.id}>
              <span className="num">{formatDay(r.starts_at.slice(0, 10))} {range(r.starts_at, r.ends_at)}</span>
              <span className="grow">{r.service_name}　{yen(r.price)}　<span className="sh-small">{r.staff_name}</span></span>
              <StatusBadge r={r} label={statusLabel(w, r.status)} />
              {r.is_trial && <span className="sh-trial">{w.trial}</span>}
              {r.status === 'booked' && (
                <span className="row">
                  <button disabled={busy} onClick={() => act((tx) => markVisited(tx, r.id), `${w.visited}にしました。`)}>{w.visited}</button>
                  <button disabled={busy} onClick={() => act((tx) => markNoshow(tx, r.id), `${w.noshow}にしました。`)}>{w.noshow}</button>
                  <button className="danger" disabled={busy} onClick={() => act((tx) => cancelReservation(tx, r.id), `${sw.rsv}をキャンセルしました。`)}>{w.canceled}</button>
                </span>
              )}
            </li>
          ))}
          {rs.length === 0 && <li>{sw.noRsv}。</li>}
        </ul>
      </div>

      <h2>変更の履歴（お店だけが見えます）</h2>
      <div className="card">
        <ul className="sh-hist">
          {hist.map((h) => {
            const d = describeHistory(h, w, sw.rsv);
            return (
              <li key={String(h.id)}>
                <span className="num">{d.when}</span>
                <span>{d.who}</span>
                <span>{d.what}{d.detail && `　${d.detail}`}</span>
              </li>
            );
          })}
          {hist.length === 0 && <li>履歴はありません。</li>}
        </ul>
      </div>
    </>
  );
}

function KarteForm({ note, caution, busy, onSave }: { note: string; caution: string; busy: boolean; onSave: (n: string, c: string) => void }) {
  const { words: w } = useApp();
  const [n, setN] = useState(note);
  const [ca, setCa] = useState(caution);
  const dirty = n !== note || ca !== caution;
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(n, ca);
      }}
    >
      <h2 style={{ marginTop: 0 }}>メモと注意（{w.customer}には見えません）</h2>
      <label className="sh-field">
        <span>注意（アレルギーなど）</span>
        <textarea rows={2} value={ca} onChange={(e) => setCa(e.target.value)} />
      </label>
      <label className="sh-field" style={{ marginTop: 8 }}>
        <span>お店のメモ</span>
        <textarea rows={3} value={n} onChange={(e) => setN(e.target.value)} />
      </label>
      <p>
        <button className="primary" type="submit" disabled={busy || !dirty}>保存</button>
      </p>
    </form>
  );
}

