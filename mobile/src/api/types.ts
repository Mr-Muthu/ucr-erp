export type DutyStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'STARTED'
  | 'COMPLETED'
  | 'SUBMITTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'BILLED';

export interface DutyVehicle {
  registrationNumber: string;
  make: string;
  model: string;
}

export interface DutyBooking {
  pickupLocation: string;
  dropLocation: string | null;
}

export interface Duty {
  id: string;
  branchId: string;
  driverId: string;
  vehicleId: string;
  vehicle: DutyVehicle;
  booking: DutyBooking | null;
  status: DutyStatus;
  scheduledStart: string;
  scheduledEnd: string | null;
  deviceStartAt: string | null;
  deviceEndAt: string | null;
  openingOdometer: number | null;
  closingOdometer: number | null;
  passengerName: string | null;
  passengerPhone: string | null;
  routeRemarks: string | null;
  declineReason: string | null;
  rejectionReason: string | null;
  disputeReason: string | null;
  updatedAt: string;
}

export interface DriverInfo {
  id: string;
  name: string;
  branchId: string;
}

export interface DriverDevice {
  clientDeviceId: string;
  expoPushToken?: string;
  deviceModel?: string;
  appVersion?: string;
  osVersion?: string;
}

export interface DriverLoginResponse {
  accessToken: string;
  refreshToken: string;
  driver: DriverInfo;
}

export type SyncItemType =
  | 'DUTY_ACCEPT'
  | 'DUTY_DECLINE'
  | 'DUTY_START'
  | 'DUTY_COMPLETE'
  | 'DUTY_SUBMIT'
  | 'DUTY_RESUBMIT'
  | 'DUTY_ENTRY'
  | 'DUTY_NIGHT_HALT';

export interface SyncItemResult {
  clientMutationId: string;
  status: 'OK' | 'ERROR';
  data?: unknown;
  error?: { code: string; message: string };
}

export interface UploadPresignResponse {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
}

export type UploadPurpose = 'DUTY_ODOMETER_PHOTO' | 'DUTY_SIGNATURE' | 'DUTY_RECEIPT';
