/**
 * Single source of truth for the B2C Booking state machine (local/outstation/
 * airport-transfer trips only — fixed-duty customers use VehicleDeployment,
 * not Booking).
 *
 * INQUIRY -> QUOTED -> CONFIRMED -> DUTY_ASSIGNED -> IN_PROGRESS -> COMPLETED -> CLOSED
 * CONFIRMED -> CANCELLED (with a cancellation charge per policy)
 * CONFIRMED -> NO_SHOW
 */

export type BookingStatus =
  | 'INQUIRY'
  | 'QUOTED'
  | 'CONFIRMED'
  | 'DUTY_ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface BookingTransition {
  action: string;
  from: BookingStatus;
  to: BookingStatus;
}

const TRANSITIONS: BookingTransition[] = [
  { action: 'quote', from: 'INQUIRY', to: 'QUOTED' },
  { action: 'confirm', from: 'QUOTED', to: 'CONFIRMED' },
  // A repeat customer / phone booking can skip straight to CONFIRMED.
  { action: 'confirm', from: 'INQUIRY', to: 'CONFIRMED' },
  { action: 'assignDuty', from: 'CONFIRMED', to: 'DUTY_ASSIGNED' },
  { action: 'startTrip', from: 'DUTY_ASSIGNED', to: 'IN_PROGRESS' },
  { action: 'complete', from: 'IN_PROGRESS', to: 'COMPLETED' },
  { action: 'close', from: 'COMPLETED', to: 'CLOSED' },
  { action: 'cancel', from: 'INQUIRY', to: 'CANCELLED' },
  { action: 'cancel', from: 'QUOTED', to: 'CANCELLED' },
  { action: 'cancel', from: 'CONFIRMED', to: 'CANCELLED' },
  { action: 'cancel', from: 'DUTY_ASSIGNED', to: 'CANCELLED' },
  { action: 'noShow', from: 'CONFIRMED', to: 'NO_SHOW' },
  { action: 'noShow', from: 'DUTY_ASSIGNED', to: 'NO_SHOW' },
];

const TERMINAL_STATUSES: BookingStatus[] = ['CLOSED', 'CANCELLED', 'NO_SHOW'];

export function isBookingTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function getAllowedBookingActions(status: BookingStatus): BookingTransition[] {
  return TRANSITIONS.filter((t) => t.from === status);
}

export class InvalidBookingTransitionError extends Error {
  constructor(action: string, from: BookingStatus) {
    super(`Booking action "${action}" is not valid from status ${from}`);
    this.name = 'InvalidBookingTransitionError';
  }
}

export function assertBookingTransition(current: BookingStatus, action: string): BookingStatus {
  const match = TRANSITIONS.find((t) => t.from === current && t.action === action);
  if (!match) {
    throw new InvalidBookingTransitionError(action, current);
  }
  return match.to;
}
