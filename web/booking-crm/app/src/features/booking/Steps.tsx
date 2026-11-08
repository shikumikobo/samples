import './booking.css';

const LABELS = ['選ぶ', '日時', '確認', '完了'];
/** いま何番目か（1〜4）を示す小さな表示 */
export function Steps({ current, service }: { current: 1 | 2 | 3 | 4; service: string }) {
  return (
    <ol className="bk-steps" aria-label="進み具合">
      {LABELS.map((l, i) => (
        <li key={l} aria-current={i + 1 === current ? 'step' : undefined}>
          {i + 1}. {i === 0 ? `${service}を${l}` : l}
        </li>
      ))}
    </ol>
  );
}
