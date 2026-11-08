// data/salon.json・data/class.json から db/seed_salon.sql・db/seed_class.sql を作る。
//   node scripts/make-seed.mjs            …… 2つとも作る
//   node scripts/make-seed.mjs <入力.json> <出力.sql>
// 入力の形は docs/contract.md §7：キーは表の名前。日時は day_offset（demo_today からの日数）と time（HH:MM）で書く。
//   - 日時の書き方は2通り：{ "starts_at": { "day_offset": 1, "time": "10:00" } } または行の中に day_offset と time を並べる
//   - 作成日時は created_day_offset＋created_time（または created_at）
//   - ends_at は、{ day_offset, time }・end_time（同じ日の HH:MM）・なし（メニューの duration_min から）
//   - 予約は session_id があれば、日時・担当を枠から取る
//   - settings は { "mode": "salon", ... } でも [{ key, value }] でもよい
//   - history がなければ、予約から作る（作成・来店・キャンセル・無断欠席）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OFFSET = '+09:00';

const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const addMin = (ts, min) => {
  const d = new Date(ts.replace(' ', 'T') + ':00' + OFFSET);
  d.setUTCMinutes(d.getUTCMinutes() + min);
  const j = new Date(d.getTime() + 9 * 3600e3).toISOString();
  return `${j.slice(0, 10)} ${j.slice(11, 16)}`;
};

export function buildSeed(data, label = '') {
  const settings = Array.isArray(data.settings)
    ? Object.fromEntries(data.settings.map((s) => [s.key, s.value]))
    : { ...(data.settings || {}) };
  const today = settings.demo_today || '2026-11-09';
  settings.demo_today = today;
  const err = (m) => { throw new Error(`${label}: ${m}`); };
  // { day_offset, time } → 'YYYY-MM-DD HH:MM'（日本時間）
  const ts = (o) => (typeof o === 'string' ? (o.length > 10 ? o.replace('T', ' ').slice(0, 16) : `${o} 00:00`) : `${addDays(today, o.day_offset)} ${o.time}`);
  const lit = (t) => `${q(t + ':00' + OFFSET)}::timestamptz`;

  const services = new Map((data.services || []).map((s) => [s.id, s]));
  const sessions = new Map();
  const out = [];

  const startOf = (r, what) => {
    if (r.starts_at) return ts(r.starts_at);
    if (r.day_offset !== undefined && r.time) return ts(r);
    return err(`${what} に starts_at（または day_offset と time）がありません`);
  };
  const endOf = (r, start, dur) => {
    if (r.ends_at) return ts(r.ends_at);
    if (r.end_time) return `${start.slice(0, 10)} ${r.end_time}`;
    if (dur) return addMin(start, dur);
    return err('ends_at を決められません（end_time かメニューの duration_min が要ります）');
  };
  // 作成日時：created_at（文字列／{day_offset,time}）、または created_day_offset＋created_time（created_offset だけでもよい）
  const createdOf = (r) => {
    if (r.created_at) return ts(r.created_at);
    const off = r.created_day_offset ?? r.created_offset;
    return off === undefined ? null : `${addDays(today, off)} ${r.created_time ?? '10:00'}`;
  };
  const insert = (table, cols, rows) => {
    if (!rows.length) return;
    out.push(`insert into ${table} (${cols.join(', ')}) values`);
    out.push(rows.map((r) => '  (' + r.join(', ') + ')').join(',\n') + ';');
  };
  const pick = (r, cols, defaults = {}) => cols.map((c) => q(r[c] !== undefined ? r[c] : defaults[c] ?? null));

  out.push(`-- ${label || 'seed'}（scripts/make-seed.mjs が data/*.json から作る。直接は直さない）`);
  out.push(`-- demo_today=${today}`);

  insert('settings', ['key', 'value'], Object.entries(settings).map(([k, v]) => [q(k), q(String(v))]));

  const scols = ['id', 'name', 'kind', 'duration_min', 'price', 'is_trial', 'first_time_only', 'return_days', 'image', 'description', 'sort', 'active'];
  insert('services', scols, (data.services || []).map((s, i) =>
    pick(s, scols, { kind: 'timed', is_trial: false, first_time_only: false, description: '', sort: i + 1, active: true })));

  insert('staff', ['id', 'name', 'title', 'active'],
    (data.staff || []).map((s) => pick(s, ['id', 'name', 'title', 'active'], { title: '', active: true })));

  insert('staff_hours', ['staff_id', 'weekday', 'open_time', 'close_time'],
    (data.staff_hours || []).map((h) => pick(h, ['staff_id', 'weekday', 'open_time', 'close_time'])));

  insert('staff_off', ['staff_id', 'day', 'note'],
    (data.staff_off || []).map((o) => {
      const day = o.day_offset !== undefined ? addDays(today, o.day_offset) : o.day;
      return [q(o.staff_id), q(day), q(o.note ?? '')];
    }));

  insert('class_sessions', ['id', 'service_id', 'staff_id', 'starts_at', 'ends_at', 'capacity'],
    (data.class_sessions || []).map((c) => {
      const s = startOf(c, `class_sessions ${c.id}`);
      const e = endOf(c, s, services.get(c.service_id)?.duration_min);
      sessions.set(c.id, { s, e, staff: c.staff_id });
      return [q(c.id), q(c.service_id), q(c.staff_id), lit(s), lit(e), q(c.capacity)];
    }));

  insert('customers', ['id', 'name', 'kana', 'phone', 'email', 'note', 'caution', 'created_at', 'active'],
    (data.customers || []).map((c) => {
      const created = createdOf(c) ?? `${addDays(today, -90)} 10:00`;
      return [q(c.id), q(c.name), q(c.kana ?? ''), q(c.phone ?? ''), q(c.email ?? ''), q(c.note ?? ''), q(c.caution ?? ''), lit(created), q(c.active ?? true)];
    }));

  const derived = [];
  // 予約のお店のメモ：JSON に note があればそれ。なければ、キャンセル・無断欠席・一部の来店に、架空のひとことを入れる（順番で決まる）
  const CANCEL_NOTES = ['体調不良のため、前日に連絡があった', '仕事の都合で日程が合わず、別の日に取り直す予定', 'お子さんの用事で来られなくなった', '日にちを間違えていたため'];
  const NOSHOW_NOTES = ['連絡なしで来店されず。次回は前日に確認の連絡をする'];
  const VISIT_NOTES = ['次回の希望をうかがった'];
  let noteIdx = 0;
  const noteOf = (r, status, i) => r.note ?? (status === 'canceled' ? CANCEL_NOTES[i % CANCEL_NOTES.length] : status === 'noshow' ? NOSHOW_NOTES[0] : status === 'visited' && i % 8 === 0 ? VISIT_NOTES[0] : '');
  const resRows = (data.reservations || []).map((r) => {
    const svc = services.get(r.service_id) || err(`reservations ${r.id}: メニュー ${r.service_id} がありません`);
    let s, e, staff = r.staff_id;
    if (r.session_id) {
      const se = sessions.get(r.session_id) || err(`reservations ${r.id}: 枠 ${r.session_id} がありません`);
      s = se.s; e = se.e; staff = staff || se.staff;
    } else {
      s = startOf(r, `reservations ${r.id}`);
      e = endOf(r, s, svc.duration_min);
    }
    const status = r.status || 'booked';
    const created = createdOf(r) ?? addMin(s, -7 * 24 * 60);
    const price = r.price ?? svc.price;
    const isTrial = r.is_trial ?? svc.is_trial ?? false;
    derived.push({ id: r.id, customer: r.customer_id, status, start: s, created,
      row: { id: r.id, customer_id: r.customer_id, service_id: r.service_id, staff_id: staff, session_id: r.session_id ?? null, starts_at: s, ends_at: e, price, is_trial: isTrial, status } });
    return [q(r.id), q(r.customer_id), q(r.service_id), q(staff), q(r.session_id ?? null), lit(s), lit(e), q(price), q(isTrial), q(status), q(noteOf(r, status, noteIdx++)), lit(created)];
  });
  // 予約は履歴のトリガーを止めて入れる（履歴は下で、日付をそろえて入れる）
  out.push('alter table reservations disable trigger reservations_history;');
  insert('reservations', ['id', 'customer_id', 'service_id', 'staff_id', 'session_id', 'starts_at', 'ends_at', 'price', 'is_trial', 'status', 'note', 'created_at'], resRows);
  out.push('alter table reservations enable trigger reservations_history;');

  const hist = [];
  if (Array.isArray(data.history) && data.history.length) {
    for (const h of data.history) {
      hist.push([lit(h.at ? ts(h.at) : startOf(h, 'history')), q(h.actor ?? 'shop'), q(h.action), q(h.reservation_id), q(h.before ?? null), q(h.after ?? null)]);
    }
  } else {
    const iso = (t) => t.replace(' ', 'T') + ':00' + OFFSET;   // 履歴の中身も、トリガーが書く形（日時は +09:00 つき）にそろえる
    const jrow = (d, st) => q({ ...d.row, starts_at: iso(d.row.starts_at), ends_at: iso(d.row.ends_at), status: st });
    for (const d of derived) {
      hist.push([lit(d.created), q(`customer:${d.customer}`), q('create'), q(d.id), 'null', jrow(d, 'booked')]);
      const act = { visited: 'visit', canceled: 'cancel', noshow: 'noshow' }[d.status];
      if (act) {
        const at = d.status === 'canceled' ? addMin(d.start, -2 * 24 * 60) : addMin(d.start, 60);
        hist.push([lit(at), q(d.status === 'canceled' ? `customer:${d.customer}` : 'shop'), q(act), q(d.id), jrow(d, 'booked'), jrow(d, d.status)]);
      }
    }
  }
  insert('history', ['at', 'actor', 'action', 'reservation_id', 'before', 'after'], hist);
  out.push(`select setval('reservation_seq', greatest(1001, (select coalesce(max(substring(id from '^R([0-9]+)$')::int), 0) + 1 from reservations)));`);
  return out.join('\n') + '\n';
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function build(inFile, outFile) {
  const sql = buildSeed(JSON.parse(readFileSync(inFile, 'utf8')), path.basename(outFile));
  writeFileSync(outFile, sql);
  console.log(`${path.relative(root, inFile)} → ${path.relative(root, outFile)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2);
  if (a && b) build(path.resolve(a), path.resolve(b));
  else {
    for (const k of ['salon', 'class']) {
      const f = path.join(root, 'data', `${k}.json`);
      if (existsSync(f)) build(f, path.join(root, 'db', `seed_${k}.sql`));
      else console.log(`data/${k}.json がまだありません（スキップ）`);
    }
  }
}
