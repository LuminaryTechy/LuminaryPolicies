// src/hooks/useUserRole.ts
import { useMsal } from '@azure/msal-react';
import { useMemo } from 'react';
import { apiScopes } from '../auth/msalConfig';
import type { UserRole } from '../types/policy';

const IT_ADMIN_GROUP  = import.meta.env.VITE_IT_ADMIN_GROUP_ID as string;
const HR_GROUP        = import.meta.env.VITE_HR_GROUP_ID as string;
const COMPLIANCE_GROUP = import.meta.env.VITE_COMPLIANCE_GROUP_ID as string;
const CLINICAL_GROUP  = import.meta.env.VITE_CLINICAL_LEADS_GROUP_ID as string;

function decodeJwtGroups(token: string): string[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.groups as string[]) ?? [];
  } catch { return []; }
}

export function useUserRole(): UserRole {
  const { accounts, instance } = useMsal();

  return useMemo(() => {
    const account = accounts[0];
    if (!account) return 'staff';

    // Try to get groups from cached token claims
    const idTokenClaims = account.idTokenClaims as Record<string, unknown> | undefined;
    const groups = (idTokenClaims?.groups as string[]) ?? [];

    if (groups.includes(IT_ADMIN_GROUP))   return 'it-admin';
    if (groups.includes(COMPLIANCE_GROUP)) return 'compliance';
    if (groups.includes(HR_GROUP))         return 'hr';
    if (groups.includes(CLINICAL_GROUP))   return 'clinical-lead';
    return 'staff';
  }, [accounts]);
}

export function useCanUpload(): boolean {
  const role = useUserRole();
  return role === 'it-admin' || role === 'hr' || role === 'compliance';
}

export function useCanSeeDrafts(category?: string): boolean {
  const role = useUserRole();
  if (role === 'it-admin' || role === 'compliance') return true;
  if (role === 'hr' && (!category || category.startsWith('2.'))) return true;
  if (role === 'clinical-lead' && category?.startsWith('3.')) return true;
  return false;
}
