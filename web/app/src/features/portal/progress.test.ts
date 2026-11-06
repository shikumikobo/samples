import { describe, expect, it } from 'vitest';
import { PROGRESS_STEPS, toProgress } from './progress';

describe('toProgress', () => {
  it('現場の状況を5段階の言葉に直す', () => {
    expect(toProgress('受付')?.label).toBe('ご相談');
    expect(toProgress('見積中')?.label).toBe('お見積り');
    expect(toProgress('受注')?.label).toBe('ご契約');
    expect(toProgress('着工')?.label).toBe('工事中');
    expect(toProgress('完工')?.label).toBe('完了');
  });
  it('請求済み・入金済み・完了はまとめて「完了」', () => {
    for (const s of ['請求済み', '入金済み', '完了']) expect(toProgress(s)?.step).toBe(4);
  });
  it('失注・無効は外部に見せない（null）', () => {
    expect(toProgress('失注')).toBeNull();
    expect(toProgress('無効')).toBeNull();
  });
  it('段階は5つ', () => {
    expect(PROGRESS_STEPS).toHaveLength(5);
    expect(toProgress('着工')?.total).toBe(5);
  });
});
