'use client';
// 画面の状態：サロン／教室（モード）、お客さん／お店（役割）、お客さん側で選んでいる人。localStorage に覚える。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_MODE, MODE_KEY, getStoredMode, readPublic, resetDemo, type Role } from '@/lib/db';
import { getWords, type Mode, type Words } from '@/lib/words';
import { DEFAULT_THEME, applyTheme, clearTheme, loadTheme, saveTheme, type Theme } from '@/lib/theme';

const ROLE_KEY = 'booking-crm.role';
const CUSTOMER_KEY = 'booking-crm.customer';

/** 「はじめての方」を選んでいるときの customerId（DB に行は無い。予約の確認の画面で名前などを入れてもらう） */
export const NEW_CUSTOMER_ID = '__new__';
export const NEW_CUSTOMER_LABEL = 'はじめての方';

export interface CustomerOption {
  id: string;
  name: string;
}

interface AppState {
  ready: boolean;
  mode: Mode;
  role: Role;
  customerId: string | null;
  customers: CustomerOption[];
  words: Words;
  theme: Theme;
  busy: boolean;
  setTheme: (t: Partial<Theme>) => void;
  resetTheme: () => void;
  setMode: (m: Mode) => Promise<void>;
  setRole: (r: Role) => void;
  setCustomerId: (id: string) => void;
  reset: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE);
  const [role, setRoleState] = useState<Role>('customer');
  const [customerId, setCustomerIdState] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME[DEFAULT_MODE]);

  useEffect(() => {
    const m = getStoredMode();
    const r = read(ROLE_KEY) === 'shop' ? 'shop' : 'customer';
    setModeState(m);
    setRoleState(r);
    const th = loadTheme(m);
    setThemeState(th);
    applyTheme(th);
    document.documentElement.dataset.role = r;
    setReady(true);
    // お客さん側で「だれとして使うか」の一覧。DB に表がまだ無いときは空のまま
    readPublic<{ id: string | number; name: string }>('select id, name from customers where active order by id')
      .then((rows) => {
        const list = rows.map((x) => ({ id: String(x.id), name: x.name }));
        setCustomers(list);
        const saved = read(CUSTOMER_KEY);
        setCustomerIdState(saved === NEW_CUSTOMER_ID || list.some((c) => c.id === saved) ? saved : (list[0]?.id ?? null));
      })
      .catch(() => {});
  }, []);

  const setRole = useCallback((r: Role) => {
    write(ROLE_KEY, r);
    document.documentElement.dataset.role = r;
    setRoleState(r);
  }, []);

  // 見た目（色・見出しの書体）：いまのモードに覚える。すぐ画面に反映する
  const setTheme = useCallback(
    (part: Partial<Theme>) => {
      const next = { ...theme, ...part };
      saveTheme(mode, next);
      applyTheme(next);
      setThemeState(next);
    },
    [mode, theme],
  );
  const resetTheme = useCallback(() => {
    clearTheme(mode);
    const th = loadTheme(mode);
    applyTheme(th);
    setThemeState(th);
  }, [mode]);

  const setCustomerId = useCallback((id: string) => {
    write(CUSTOMER_KEY, id);
    setCustomerIdState(id);
  }, []);

  // モードを変える＝そのモードの架空のデータで作り直す。終わったら読み込み直して、全画面を新しい言葉にする
  const setMode = useCallback(
    async (m: Mode) => {
      if (m === mode || busy) return;
      setBusy(true);
      try {
        await resetDemo(m);
      } finally {
        window.location.reload();
      }
    },
    [mode, busy],
  );

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await resetDemo(mode);
    } finally {
      window.location.reload();
    }
  }, [mode]);

  const value = useMemo<AppState>(
    () => ({ ready, mode, role, customerId, customers, words: getWords(mode), theme, busy, setMode, setRole, setCustomerId, setTheme, resetTheme, reset }),
    [ready, mode, role, customerId, customers, theme, busy, setMode, setRole, setCustomerId, setTheme, resetTheme, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider の外です');
  return v;
}

export function useWords(): Words {
  return useApp().words;
}

export { MODE_KEY };
