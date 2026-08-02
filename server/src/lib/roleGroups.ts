import type { StaffRole } from '@prisma/client';

// Central reference for the permission policy map from the spec:
// "OWNER can void invoices; ACCOUNTS manages money but not fleet;
//  OPS manages fleet/bookings/duties but cannot void financial records;
//  VIEWER read-only."
export const ALL_STAFF: StaffRole[] = ['OWNER', 'MANAGER', 'OPS', 'ACCOUNTS', 'VIEWER'];
export const FLEET_MANAGERS: StaffRole[] = ['OWNER', 'MANAGER', 'OPS'];
export const MONEY_MANAGERS: StaffRole[] = ['OWNER', 'MANAGER', 'ACCOUNTS'];
export const OWNER_ONLY: StaffRole[] = ['OWNER'];
