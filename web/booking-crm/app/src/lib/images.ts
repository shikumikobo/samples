// メニューの画像。同梱の画像（public/images/）の名前か、お店が選んだ写真（data: の URL）のどちらか。
export const PRESET_IMAGES: { file: string; label: string; mode: 'salon' | 'class' }[] = [
  { file: 'nail_trial.png', label: 'ネイル：体験', mode: 'salon' },
  { file: 'nail_onecolor.png', label: 'ネイル：ワンカラー', mode: 'salon' },
  { file: 'nail_art.png', label: 'ネイル：アート', mode: 'salon' },
  { file: 'nail_foot.png', label: 'ネイル：フット', mode: 'salon' },
  { file: 'nail_off.png', label: 'ネイル：オフ', mode: 'salon' },
  { file: 'nail_care.png', label: 'ネイル：ケア', mode: 'salon' },
  { file: 'nail_repair.png', label: 'ネイル：リペア', mode: 'salon' },
  { file: 'cook_trial.png', label: '料理：体験', mode: 'class' },
  { file: 'cook_washoku.png', label: '料理：和食', mode: 'class' },
  { file: 'cook_western.png', label: '料理：洋食', mode: 'class' },
  { file: 'cook_italian.png', label: '料理：イタリアン', mode: 'class' },
  { file: 'cook_bread.png', label: '料理：パン', mode: 'class' },
  { file: 'cook_sweets.png', label: '料理：お菓子', mode: 'class' },
  { file: 'cook_ferment.png', label: '料理：発酵', mode: 'class' },
];

/** <img src> に使う文字列 */
export function imageSrc(image: string | null | undefined): string {
  if (!image) return '/icons/icon-192.png';
  return image.startsWith('data:') ? image : `/images/${image}`;
}

/** 選んだ写真を、幅 640px 以内の JPEG（data: の URL）にする。ブラウザの中だけで行い、外には送らない */
export async function fileToDataUrl(file: File, maxW = 640): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像のファイル（PNG・JPEG など）を選んでください。');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ng(new Error('画像を読み込めませんでした。'));
      i.src = url;
    });
    const k = Math.min(1, maxW / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
