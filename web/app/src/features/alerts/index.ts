// 対応漏れの警告の判定（日付と行を受け取る関数。DB には触らない）。
// 基準日の「今日」はデモなので 2026-11-06 固定。画面の「基準日」で変えられる（lib/demo-date.ts）。

export interface AlertSite {
  id: string;
  name: string;
  status: string;
  staff_id: string | null;
  received_on: string | null; // 'YYYY-MM-DD'
  planned_start: string | null;
  planned_end: string | null;
}

export interface AlertSettings {
  today: string; // 'YYYY-MM-DD'
  unassignedDays: number; // 受付から何日たっても担当が決まっていなければ警告
}

export type AlertKind = 'unassigned' | 'start-late' | 'finish-late';

export interface SiteAlert {
  kind: AlertKind;
  siteId: string;
  siteName: string;
  message: string;
  days: number; // 超えた日数
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { today: '2026-11-06', unassignedDays: 3 };

const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** a から b までの日数（b が後なら正） */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function computeAlerts(sites: AlertSite[], s: AlertSettings = DEFAULT_ALERT_SETTINGS): SiteAlert[] {
  const out: SiteAlert[] = [];
  for (const site of sites) {
    if (site.status === '受付' && !site.staff_id && site.received_on) {
      const days = daysBetween(site.received_on, s.today);
      if (days >= s.unassignedDays) {
        out.push({ kind: 'unassigned', siteId: site.id, siteName: site.name, days, message: `受付から${days}日たっても、担当が決まっていません` });
      }
    }
    if (site.status === '受注' && site.planned_start) {
      const days = daysBetween(site.planned_start, s.today);
      if (days > 0) out.push({ kind: 'start-late', siteId: site.id, siteName: site.name, days, message: `着工予定日を${days}日過ぎても、「受注」のままです` });
    }
    if (site.status === '着工' && site.planned_end) {
      const days = daysBetween(site.planned_end, s.today);
      if (days > 0) out.push({ kind: 'finish-late', siteId: site.id, siteName: site.name, days, message: `完工予定日を${days}日過ぎても、「完工」にしていません` });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}
