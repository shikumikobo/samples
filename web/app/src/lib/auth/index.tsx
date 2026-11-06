'use client';
// 役割を選んで入る（アカウント作成・パスワードなし）。選んだ人は localStorage に保存する。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { readPublic, type AppRole, type SessionUser } from '@/lib/db';

const KEY = 'site-manager.user';
const ROLE_ORDER: AppRole[] = ['owner', 'staff', 'worker', 'customer', 'partner'];

interface SessionValue {
  user: SessionUser | null;
  ready: boolean;
  signIn: (u: SessionUser) => void;
  signOut: () => void;
}
const Ctx = createContext<SessionValue>({ user: null, ready: false, signIn: () => {}, signOut: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw) as SessionUser);
    } catch {
      /* 保存が使えなくても動く */
    }
    setReady(true);
  }, []);

  const signIn = useCallback((u: SessionUser) => {
    setUser(u);
    try {
      localStorage.setItem(KEY, JSON.stringify(u));
    } catch {}
  }, []);
  const signOut = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, signOut }), [user, ready, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** デモの利用者：役割ごとに最大2人（app_users から） */
export async function listDemoUsers(): Promise<SessionUser[]> {
  const rows = await readPublic<SessionUser>(
    `select id, name, role::text as role, title from app_users where active order by id`,
  );
  const out: SessionUser[] = [];
  for (const role of ROLE_ORDER) out.push(...rows.filter((r) => r.role === role).slice(0, 2));
  return out;
}

/** 社内（社長・社員・職人）か、外部（お客さん・協力業者）か */
export const homePath = (role: AppRole) => (role === 'customer' || role === 'partner' ? '/portal/' : '/today/');

export function useRequireSession(): SessionValue {
  const s = useSession();
  const router = useRouter();
  useEffect(() => {
    if (s.ready && !s.user && typeof window !== 'undefined') router.replace('/');
  }, [s.ready, s.user, router]);
  return s;
}
