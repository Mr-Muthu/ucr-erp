/**
 * Single source of truth for the Duty state machine. Both the staff-side
 * `/duties/:id/transition` endpoint and the driver-side accept/start/complete
 * endpoints (Phase 2) must route through `assertDutyTransition` — no other
 * code may write `duty.status` directly.
 *
 * ASSIGNED -> ACCEPTED -> STARTED -> COMPLETED -> SUBMITTED
 *   -> APPROVED -> BILLED (terminal, locked once on an invoice)
 *   -> DISPUTED -> RESOLVED -> APPROVED -> BILLED
 *   -> REJECTED -> (back to driver for correction) -> SUBMITTED
 * ASSIGNED -> DECLINED (driver declines, terminal — ops re-assigns a new duty)
 */

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

export type DutyActor = 'DRIVER' | 'STAFF';

export interface DutyTransition {
  action: string;
  from: DutyStatus;
  to: DutyStatus;
  actor: DutyActor;
}

const TRANSITIONS: DutyTransition[] = [
  { action: 'accept', from: 'ASSIGNED', to: 'ACCEPTED', actor: 'DRIVER' },
  { action: 'decline', from: 'ASSIGNED', to: 'DECLINED', actor: 'DRIVER' },
  { action: 'start', from: 'ACCEPTED', to: 'STARTED', actor: 'DRIVER' },
  { action: 'complete', from: 'STARTED', to: 'COMPLETED', actor: 'DRIVER' },
  { action: 'submit', from: 'COMPLETED', to: 'SUBMITTED', actor: 'DRIVER' },
  { action: 'approve', from: 'SUBMITTED', to: 'APPROVED', actor: 'STAFF' },
  { action: 'dispute', from: 'SUBMITTED', to: 'DISPUTED', actor: 'STAFF' },
  { action: 'reject', from: 'SUBMITTED', to: 'REJECTED', actor: 'STAFF' },
  // Rejected duties go back to the driver for correction, then re-submit.
  { action: 'resubmit', from: 'REJECTED', to: 'SUBMITTED', actor: 'DRIVER' },
  { action: 'resolve', from: 'DISPUTED', to: 'RESOLVED', actor: 'STAFF' },
  { action: 'approve', from: 'RESOLVED', to: 'APPROVED', actor: 'STAFF' },
  // Locked onto an invoice — only the reconciliation/invoice pipeline may do this.
  { action: 'bill', from: 'APPROVED', to: 'BILLED', actor: 'STAFF' },
];

const TERMINAL_STATUSES: DutyStatus[] = ['DECLINED', 'BILLED'];

export function isDutyTerminal(status: DutyStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function getAllowedDutyActions(status: DutyStatus, actor: DutyActor): DutyTransition[] {
  return TRANSITIONS.filter((t) => t.from === status && t.actor === actor);
}

export class InvalidDutyTransitionError extends Error {
  constructor(action: string, from: DutyStatus, actor: DutyActor) {
    super(`Duty action "${action}" is not valid from status ${from} for actor ${actor}`);
    this.name = 'InvalidDutyTransitionError';
  }
}

/** Throws InvalidDutyTransitionError if the (status, action, actor) combination isn't a legal transition; otherwise returns the target status. */
export function assertDutyTransition(current: DutyStatus, action: string, actor: DutyActor): DutyStatus {
  const match = TRANSITIONS.find((t) => t.from === current && t.action === action && t.actor === actor);
  if (!match) {
    throw new InvalidDutyTransitionError(action, current, actor);
  }
  return match.to;
}
