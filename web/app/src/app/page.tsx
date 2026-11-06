'use client';
// ログイン：役割を選ぶボタンで入る（アカウント作成・パスワードなし）
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homePath, listDemoUsers, useSession } from '@/lib/auth';
import { ROLE_LABEL, type SessionUser } from '@/lib/db';
import { InstallHint } from '@/components/InstallHint';

const HELP: Record<string, string> = {
  owner: 'すべての現場・金額・ユーザー管理・変更の履歴',
  staff: 'すべての現場と金額（ユーザー管理はなし）',
  worker: '担当の現場だけ。金額は見えません',
  customer: '自分の現場の専用ページ（進み具合・予定・見積・共有ファイル）',
  partner: '割り当てられた現場の専用ページ（予定・共有ファイル。金額なし）',
};

export default function LoginPage() {
  const { user, ready, signIn } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<SessionUser[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listDemoUsers().then(setUsers).catch((e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(() => {
    if (ready && user) router.replace(homePath(user.role));
  }, [ready, user, router]);

  const inside = (users ?? []).filter((u) => ['owner', 'staff', 'worker'].includes(u.role));
  const outside = (users ?? []).filter((u) => ['customer', 'partner'].includes(u.role));
  const enter = (u: SessionUser) => {
    signIn(u);
    router.push(homePath(u.role));
  };
  const Row = ({ u }: { u: SessionUser }) => (
    <li>
      <button onClick={() => enter(u)}>
        <span className="who">{u.name}<span className="role">{ROLE_LABEL[u.role]}</span></span>
        <span className="help">{HELP[u.role]}</span>
      </button>
    </li>
  );

  return (
    <main className="login">
      <h1>現場管理アプリ（見本）</h1>
      <p className="lead">同じデータを、入る人によって見え方が変わる様子を試せます。架空の工務店（従業員10人）のデモです。パスワードは要りません。</p>
      <ol className="how">
        <li>入る人を選ぶ</li>
        <li>画面の上の「役割」で、別の人に切り替えて見比べる</li>
      </ol>
      {error && <p className="alert">読み込みに失敗しました：{error}</p>}
      {!users && !error && <p className="muted">準備中…（初めて開くときは10秒ほどかかります）</p>}
      {users && (
        <>
          <section aria-labelledby="g-in">
            <h2 id="g-in">社内の人として入る</h2>
            <ul className="login-list">{inside.map((u) => <Row key={u.id} u={u} />)}</ul>
          </section>
          <section aria-labelledby="g-out">
            <h2 id="g-out">外部の人として入る<span className="sub">お客さん・協力業者の専用ページ</span></h2>
            <ul className="login-list">{outside.map((u) => <Row key={u.id} u={u} />)}</ul>
          </section>
        </>
      )}
      <p className="data-note">データはこのブラウザの中だけにあります。入ったあと、画面の上の「最初に戻す」でいつでも元に戻せます。</p>
      <InstallHint />
    </main>
  );
}
