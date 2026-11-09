'use client';
import { InstallButton, useInstall } from '@/lib/install';

/** 最初の画面の「スマホのホーム画面に追加」の案内。インストールは、ボタンを押したときだけ行う */
export function InstallHint() {
  const { installed } = useInstall();
  if (installed) return null;
  return (
    <div className="install-hint">
      <strong>スマホのホーム画面に追加できます。</strong>
      <div style={{ marginTop: 8 }}>
        <InstallButton />
      </div>
    </div>
  );
}
