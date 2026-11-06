'use client';
import { useState } from 'react';
import { resetDemo } from '@/lib/db';

export function DemoBanner() {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false); // 画面の中で確かめる（ブラウザの確認ダイアログは、スマホのアプリ表示で使いにくいため）
  async function reset() {
    setBusy(true);
    try {
      await resetDemo();
      window.location.reload();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }
  return (
    <aside className="demo-banner" aria-label="デモの案内">
      <span>架空の工務店のデモです。データはこのブラウザの中だけにあります。</span>
      {asking ? (
        <span className="row">
          <span>架空のデータを最初の状態に戻します。</span>
          <button onClick={reset} disabled={busy} className="primary">
            {busy ? '戻しています…' : '戻す'}
          </button>
          <button onClick={() => setAsking(false)} disabled={busy}>やめる</button>
        </span>
      ) : (
        <button onClick={() => setAsking(true)}>最初に戻す</button>
      )}
    </aside>
  );
}
