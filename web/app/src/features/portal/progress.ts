// 外部（お客さん）向けの「進み具合」：社内の現場の状況を、5段階のやさしい言葉に直す。
export const PROGRESS_STEPS = ['ご相談', 'お見積り', 'ご契約', '工事中', '完了'] as const;
export type ProgressLabel = (typeof PROGRESS_STEPS)[number];

export type Progress = { step: number; label: ProgressLabel; total: number } | null;

const MAP: Record<string, number> = {
  受付: 0,
  見積中: 1,
  受注: 2,
  着工: 3,
  完工: 4,
  請求済み: 4,
  入金済み: 4,
  完了: 4,
};

/** 現場の状況 → 進み具合。失注・無効など、外部に見せない状況は null。 */
export function toProgress(status: string): Progress {
  const step = MAP[status];
  if (step === undefined) return null;
  return { step, label: PROGRESS_STEPS[step], total: PROGRESS_STEPS.length };
}
