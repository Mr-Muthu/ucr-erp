import { describe, expect, it } from 'vitest';
import { assertBookingTransition, InvalidBookingTransitionError, isBookingTerminal } from './bookingStatus.js';

describe('booking state machine', () => {
  it('walks the full happy path from INQUIRY to CLOSED', () => {
    expect(assertBookingTransition('INQUIRY', 'quote')).toBe('QUOTED');
    expect(assertBookingTransition('QUOTED', 'confirm')).toBe('CONFIRMED');
    expect(assertBookingTransition('CONFIRMED', 'assignDuty')).toBe('DUTY_ASSIGNED');
    expect(assertBookingTransition('DUTY_ASSIGNED', 'startTrip')).toBe('IN_PROGRESS');
    expect(assertBookingTransition('IN_PROGRESS', 'complete')).toBe('COMPLETED');
    expect(assertBookingTransition('COMPLETED', 'close')).toBe('CLOSED');
  });

  it('allows a phone booking to skip straight from INQUIRY to CONFIRMED', () => {
    expect(assertBookingTransition('INQUIRY', 'confirm')).toBe('CONFIRMED');
  });

  it('allows cancellation from any pre-trip status', () => {
    expect(assertBookingTransition('INQUIRY', 'cancel')).toBe('CANCELLED');
    expect(assertBookingTransition('QUOTED', 'cancel')).toBe('CANCELLED');
    expect(assertBookingTransition('CONFIRMED', 'cancel')).toBe('CANCELLED');
    expect(assertBookingTransition('DUTY_ASSIGNED', 'cancel')).toBe('CANCELLED');
  });

  it('marks NO_SHOW only from CONFIRMED or DUTY_ASSIGNED', () => {
    expect(assertBookingTransition('CONFIRMED', 'noShow')).toBe('NO_SHOW');
    expect(assertBookingTransition('DUTY_ASSIGNED', 'noShow')).toBe('NO_SHOW');
    expect(() => assertBookingTransition('IN_PROGRESS', 'noShow')).toThrow(InvalidBookingTransitionError);
  });

  it('rejects cancelling a trip already in progress', () => {
    expect(() => assertBookingTransition('IN_PROGRESS', 'cancel')).toThrow(InvalidBookingTransitionError);
  });

  it('treats CLOSED, CANCELLED and NO_SHOW as terminal', () => {
    expect(isBookingTerminal('CLOSED')).toBe(true);
    expect(isBookingTerminal('CANCELLED')).toBe(true);
    expect(isBookingTerminal('NO_SHOW')).toBe(true);
    expect(isBookingTerminal('CONFIRMED')).toBe(false);
  });
});
