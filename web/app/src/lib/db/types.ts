export type AppRole = 'owner' | 'staff' | 'worker' | 'customer' | 'partner';

/** デモで入る利用者（DB の app_users の1行） */
export interface SessionUser {
  id: string;
  name: string;
  role: AppRole;
  title: string | null;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: '社長（管理者）',
  staff: '社員（営業・事務）',
  worker: '職人（スタッフ）',
  customer: 'お客さん',
  partner: '協力業者',
};

export const isExternal = (role: AppRole) => role === 'customer' || role === 'partner';
