'use client';
import type { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
}

/** タブの切り替え。中身は呼び出し側が出し分ける */
export function Tabs({ tabs, current, onChange }: { tabs: TabItem[]; current: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === current} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
