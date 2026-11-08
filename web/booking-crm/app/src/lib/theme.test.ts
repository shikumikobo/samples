import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_BOOT, applyTheme, clearTheme, loadTheme, saveTheme, themeKey } from './theme';

describe('theme（見た目の設定）', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.color;
    delete document.documentElement.dataset.font;
  });

  it('初期値：サロンはローズ＋明朝、教室はセージ＋丸ゴシック', () => {
    expect(loadTheme('salon')).toEqual({ color: 'rose', font: 'mincho' });
    expect(loadTheme('class')).toEqual({ color: 'sage', font: 'maru' });
  });

  it('保存した設定はモードごとに読め、別のモードには影響しない', () => {
    saveTheme('salon', { color: 'mauve', font: 'gothic' });
    expect(loadTheme('salon')).toEqual({ color: 'mauve', font: 'gothic' });
    expect(loadTheme('class')).toEqual(DEFAULT_THEME.class);
    expect(localStorage.getItem(themeKey('salon'))).toContain('mauve');
  });

  it('clearTheme で初期値に戻る', () => {
    saveTheme('class', { color: 'rose', font: 'mincho' });
    clearTheme('class');
    expect(loadTheme('class')).toEqual(DEFAULT_THEME.class);
  });

  it('壊れた値・不正なキーは、その項目だけ初期値にする', () => {
    localStorage.setItem(themeKey('salon'), '{not json');
    expect(loadTheme('salon')).toEqual(DEFAULT_THEME.salon);
    localStorage.setItem(themeKey('salon'), JSON.stringify({ color: 'neon', font: 'gothic' }));
    expect(loadTheme('salon')).toEqual({ color: 'rose', font: 'gothic' });
    localStorage.setItem(themeKey('class'), JSON.stringify({ color: 'mauve', font: 42 }));
    expect(loadTheme('class')).toEqual({ color: 'mauve', font: 'maru' });
    localStorage.setItem(themeKey('class'), 'null');
    expect(() => loadTheme('class')).not.toThrow();
  });

  it('applyTheme が html の data 属性に入れる', () => {
    applyTheme({ color: 'sage', font: 'maru' });
    expect(document.documentElement.dataset.color).toBe('sage');
    expect(document.documentElement.dataset.font).toBe('maru');
  });

  it('THEME_BOOT：初回はモードの初期値、保存があればそれを使い、壊れていても落ちない', () => {
    const run = () => new Function(THEME_BOOT)();
    run();
    expect(document.documentElement.dataset.color).toBe('rose');
    expect(document.documentElement.dataset.font).toBe('mincho');
    localStorage.setItem('booking-crm.mode', 'class');
    run();
    expect(document.documentElement.dataset.color).toBe('sage');
    expect(document.documentElement.dataset.font).toBe('maru');
    localStorage.setItem(themeKey('class'), JSON.stringify({ color: 'mauve', font: 'gothic' }));
    run();
    expect(document.documentElement.dataset.color).toBe('mauve');
    expect(document.documentElement.dataset.font).toBe('gothic');
    localStorage.setItem(themeKey('class'), '{broken');
    expect(run).not.toThrow();
    expect(document.documentElement.dataset.color).toBe('rose');
  });
});
