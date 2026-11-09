'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * サービスワーカー（画面と静的ファイルを保存し、機内モードでも開けるようにするもの）を登録する。
 * 自動では登録しない。「アプリとしてインストール」を押したとき（と、すでにインストール済みのとき）だけ。
 */
async function enableOffline() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    // 開いたときに読み込んだファイルも、サービスワーカーに保存してもらう
    const urls = performance.getEntriesByType('resource').map((r) => r.name);
    reg.active?.postMessage({ type: 'cache-urls', urls });
  } catch {
    /* 登録できなくても、画面はそのまま使える */
  }
}

interface InstallState {
  /** すでにアプリとして開いている（ボタンは出さない） */
  installed: boolean;
  /** 押したあとに出す案内の文（ブラウザの画面が出ないとき） */
  message: string | null;
  install: () => Promise<void>;
}

const Ctx = createContext<InstallState>({ installed: false, message: null, install: async () => {} });

export function InstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const evt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setInstalled(standalone);
    // すでにインストール済みの端末では、オフラインの保存を更新し続ける。初めての人には何も入れない
    if (standalone) {
      void enableOffline();
    } else if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then((r) => r && enableOffline());
    }
    const before = (e: Event) => {
      e.preventDefault(); // ブラウザの自動の案内は出さず、ボタンを押したときだけ出す
      evt.current = e as BeforeInstallPromptEvent;
    };
    const done = () => {
      evt.current = null;
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', done);
    };
  }, []);

  const install = useCallback(async () => {
    setMessage(null);
    await enableOffline();
    const e = evt.current;
    if (e) {
      evt.current = null;
      await e.prompt();
      return;
    }
    setMessage(
      /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? 'Safari の共有ボタン →「ホーム画面に追加」を選んでください。'
        : 'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。',
    );
  }, []);

  return <Ctx.Provider value={{ installed, message, install }}>{children}</Ctx.Provider>;
}

export const useInstall = () => useContext(Ctx);

/** 「アプリとしてインストール」のボタン。インストール済みなら何も出さない */
export function InstallButton({ className = '' }: { className?: string }) {
  const { installed, message, install } = useInstall();
  if (installed) return null;
  return (
    <span className={`install-wrap ${className}`.trim()}>
      <button type="button" className="install-btn" onClick={() => void install()}>
        アプリとしてインストール
      </button>
      {message && (
        <span role="status" className="install-msg">
          {message}
        </span>
      )}
    </span>
  );
}
