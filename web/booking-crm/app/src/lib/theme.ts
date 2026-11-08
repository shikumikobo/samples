// 見た目の設定：色と見出しの書体。サロン／教室ごとに、ブラウザ（localStorage）に覚える。
// 色は globals.css の :root[data-color=…]、書体は :root[data-font=…] が受ける。
import type { Mode } from '@/lib/words';

export type ColorKey = 'rose' | 'mauve' | 'sage';
export type FontKey = 'mincho' | 'maru' | 'gothic';
export interface Theme {
  color: ColorKey;
  font: FontKey;
}

export const COLORS: { key: ColorKey; label: string; swatch: string }[] = [
  { key: 'rose', label: 'ローズ', swatch: '#B04A62' },
  { key: 'mauve', label: 'モーヴ', swatch: '#7B5E8C' },
  { key: 'sage', label: 'セージ', swatch: '#4F7A66' },
];
export const FONTS: { key: FontKey; label: string }[] = [
  { key: 'mincho', label: '明朝' },
  { key: 'maru', label: '丸ゴシック' },
  { key: 'gothic', label: 'ゴシック' },
];

/** 初めて開いたときの見た目：サロンはローズ＋明朝、教室はセージ＋丸ゴシック */
export const DEFAULT_THEME: Record<Mode, Theme> = {
  salon: { color: 'rose', font: 'mincho' },
  class: { color: 'sage', font: 'maru' },
};

export const themeKey = (mode: Mode) => `booking-crm.theme.${mode}`;

const isColor = (v: unknown): v is ColorKey => COLORS.some((c) => c.key === v);
const isFont = (v: unknown): v is FontKey => FONTS.some((f) => f.key === v);

/** 覚えている設定を読む。無い・壊れているときは、そのモードの初期値 */
export function loadTheme(mode: Mode): Theme {
  const base = DEFAULT_THEME[mode];
  try {
    const raw = localStorage.getItem(themeKey(mode));
    if (!raw) return base;
    const v = JSON.parse(raw) as Partial<Theme>;
    return { color: isColor(v.color) ? v.color : base.color, font: isFont(v.font) ? v.font : base.font };
  } catch {
    return base;
  }
}

export function saveTheme(mode: Mode, t: Theme) {
  try {
    localStorage.setItem(themeKey(mode), JSON.stringify(t));
  } catch {}
}

export function clearTheme(mode: Mode) {
  try {
    localStorage.removeItem(themeKey(mode));
  } catch {}
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  el.dataset.color = t.color;
  el.dataset.font = t.font;
  const meta = document.querySelector('meta[name="theme-color"]');
  const sw = COLORS.find((c) => c.key === t.color)?.swatch;
  if (meta && sw) meta.setAttribute('content', sw);
}

/** 画面が出る前に実行する短いスクリプト（ちらつき防止）。layout.tsx の <head> に埋める */
export const THEME_BOOT = `(function(){try{var D=${JSON.stringify(DEFAULT_THEME)};var m=localStorage.getItem('booking-crm.mode')==='class'?'class':'salon';var t=D[m];var r=localStorage.getItem('booking-crm.theme.'+m);if(r){var v=JSON.parse(r);if(v.color)t.color=v.color;if(v.font)t.font=v.font}var e=document.documentElement;e.dataset.color=t.color;e.dataset.font=t.font}catch(x){var e=document.documentElement;e.dataset.color='rose';e.dataset.font='mincho'}})()`;
