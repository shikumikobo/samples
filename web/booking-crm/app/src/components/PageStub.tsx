'use client';
import { useApp, useWords } from '@/lib/app-state';
import type { Words } from '@/lib/words';

type TitleKey = {
  [K in keyof Words]: K extends `page_${string}` ? K : never;
}[keyof Words];

/** 段階2で中身を作るまでの空のページ。題名と「準備中」だけ */
export function PageStub({ titleKey }: { titleKey: TitleKey }) {
  const w = useWords();
  const { role } = useApp();
  return (
    <section className={role === 'shop' ? 'page shop' : 'page customer'}>
      <h1>{w[titleKey]}</h1>
      <p className="muted">準備中</p>
    </section>
  );
}
