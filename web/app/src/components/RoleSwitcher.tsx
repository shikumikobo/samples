'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homePath, listDemoUsers, useSession } from '@/lib/auth';
import { ROLE_LABEL, type SessionUser } from '@/lib/db';

/** 画面の上にいつでも出す、役割の切り替え */
export function RoleSwitcher() {
  const { user, signIn } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<SessionUser[]>([]);
  useEffect(() => {
    listDemoUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  if (!user) return null;
  return (
    <label className="role-switcher">
      <span>役割</span>
      <select
        value={user.id}
        onChange={(e) => {
          const next = users.find((u) => u.id === e.target.value);
          if (!next) return;
          signIn(next);
          router.push(homePath(next.role));
        }}
        aria-label="役割を切り替える"
      >
        {(users.length ? users : [user]).map((u) => (
          <option key={u.id} value={u.id}>
            {ROLE_LABEL[u.role]}：{u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
