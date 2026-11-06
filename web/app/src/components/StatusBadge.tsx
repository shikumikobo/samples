export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge s-${status}`}>{status}</span>;
}
