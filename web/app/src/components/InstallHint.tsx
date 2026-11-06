'use client';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** 「ホーム画面に追加」の案内。Android は追加ボタン、iPhone は手順の文を出す */
export function InstallHint() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches);
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (standalone) return null;
  return (
    <div className="install-hint">
      <strong>スマホのホーム画面に追加できます。</strong>
      {evt ? (
        <div style={{ marginTop: 6 }}>
          <button className="primary" onClick={() => evt.prompt()}>
            ホーム画面に追加する
          </button>
        </div>
      ) : ios ? (
        <div>Safari の共有ボタン →「ホーム画面に追加」を選びます。</div>
      ) : (
        <div>ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。</div>
      )}
    </div>
  );
}
