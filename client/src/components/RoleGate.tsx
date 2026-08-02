import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { StaffRole } from '../types/domain';

/** Renders children only if the current staff user's role is in the allowed list — "UI never shows actions the role lacks." */
export function RoleGate({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return null;
  return <>{children}</>;
}

export function useHasRole(roles: StaffRole[]): boolean {
  const { user } = useAuth();
  return Boolean(user && roles.includes(user.role));
}
