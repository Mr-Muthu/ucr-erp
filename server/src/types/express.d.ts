import type { StaffRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      staffAuth?: {
        userId: string;
        role: StaffRole;
        branchId: string;
      };
      driverAuth?: {
        driverAccountId: string;
        driverId: string;
        branchId: string;
        deviceId?: string;
      };
    }
  }
}

export {};
