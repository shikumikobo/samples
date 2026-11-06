'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** 外部（お客さん・協力業者）が社内の画面に来たら、専用ページに戻す。社内の各画面から呼ぶ。 */
export function useRedirectExternal(role: string | undefined) {
  const router = useRouter();
  const external = role === 'customer' || role === 'partner';
  useEffect(() => {
    if (external) router.replace('/portal/');
  }, [external, router]);
  return external;
}
