import { describe, expect, it } from 'vitest';
import { assertDutyTransition, getAllowedDutyActions, InvalidDutyTransitionError, isDutyTerminal } from './dutyStatus.js';

describe('duty state machine', () => {
  it('walks the full happy path from ASSIGNED to BILLED', () => {
    expect(assertDutyTransition('ASSIGNED', 'accept', 'DRIVER')).toBe('ACCEPTED');
    expect(assertDutyTransition('ACCEPTED', 'start', 'DRIVER')).toBe('STARTED');
    expect(assertDutyTransition('STARTED', 'complete', 'DRIVER')).toBe('COMPLETED');
    expect(assertDutyTransition('COMPLETED', 'submit', 'DRIVER')).toBe('SUBMITTED');
    expect(assertDutyTransition('SUBMITTED', 'approve', 'STAFF')).toBe('APPROVED');
    expect(assertDutyTransition('APPROVED', 'bill', 'STAFF')).toBe('BILLED');
  });

  it('supports the dispute -> resolve -> approve path', () => {
    expect(assertDutyTransition('SUBMITTED', 'dispute', 'STAFF')).toBe('DISPUTED');
    expect(assertDutyTransition('DISPUTED', 'resolve', 'STAFF')).toBe('RESOLVED');
    expect(assertDutyTransition('RESOLVED', 'approve', 'STAFF')).toBe('APPROVED');
  });

  it('supports the reject -> driver correction -> resubmit path', () => {
    expect(assertDutyTransition('SUBMITTED', 'reject', 'STAFF')).toBe('REJECTED');
    expect(assertDutyTransition('REJECTED', 'resubmit', 'DRIVER')).toBe('SUBMITTED');
  });

  it('allows the driver to decline an assignment with a terminal DECLINED status', () => {
    expect(assertDutyTransition('ASSIGNED', 'decline', 'DRIVER')).toBe('DECLINED');
    expect(isDutyTerminal('DECLINED')).toBe(true);
    expect(isDutyTerminal('BILLED')).toBe(true);
    expect(isDutyTerminal('ASSIGNED')).toBe(false);
  });

  it('rejects an out-of-order transition (cannot approve before submission)', () => {
    expect(() => assertDutyTransition('STARTED', 'approve', 'STAFF')).toThrow(InvalidDutyTransitionError);
  });

  it('rejects a transition attempted by the wrong actor (driver cannot approve)', () => {
    expect(() => assertDutyTransition('SUBMITTED', 'approve', 'DRIVER')).toThrow(InvalidDutyTransitionError);
  });

  it('rejects billing a duty that has not been approved', () => {
    expect(() => assertDutyTransition('SUBMITTED', 'bill', 'STAFF')).toThrow(InvalidDutyTransitionError);
  });

  it('lists no legal actions once BILLED (fully locked)', () => {
    expect(getAllowedDutyActions('BILLED', 'STAFF')).toHaveLength(0);
    expect(getAllowedDutyActions('BILLED', 'DRIVER')).toHaveLength(0);
  });
});
