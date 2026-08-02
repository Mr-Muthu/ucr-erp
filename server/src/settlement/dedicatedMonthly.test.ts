import { describe, expect, it } from 'vitest';
import { computeDedicatedMonthlySettlement, type DedicatedMonthlyRateTerms } from './dedicatedMonthly.js';

// Shared rate card used across scenarios: vendor DEDICATED_MONTHLY terms.
// The exact same function/terms shape is used for CUSTOMER_FIXED_DUTY_MONTHLY
// per spec — "one code path, tested once, used for both" — see the
// "fixed-duty customer proration" case below.
const RATE: DedicatedMonthlyRateTerms = {
  fixedMonthlyAmount: 60_000,
  includedKm: 3_000,
  includedHours: 300,
  extraKmRate: 12,
  extraHourRate: 50,
  nightHaltRate: 300,
  outstationBattaRate: 400,
};

const JULY = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-31T00:00:00Z') }; // 31 days

describe('computeDedicatedMonthlySettlement', () => {
  it('prorates the fixed fee when the deployment starts mid-month', () => {
    const result = computeDedicatedMonthlySettlement({
      periodStart: JULY.start,
      periodEnd: JULY.end,
      deploymentStartDate: new Date('2026-07-16T00:00:00Z'),
      deploymentEndDate: null,
      segments: [
        {
          startDate: new Date('2026-07-16T00:00:00Z'),
          endDate: null,
          openingOdometer: 10_000,
          closingOdometer: 10_800, // 800 km, under included km
        },
      ],
      rate: RATE,
      actualHours: 140,
      nightHaltCount: 0,
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    expect(result.daysInPeriod).toBe(31);
    expect(result.activeDays).toBe(16); // 16th through 31st inclusive
    // 60,000 * 16/31 = 30,967.741... -> half-up to the paisa
    expect(result.proratedFixedAmount).toBeCloseTo(30_967.74, 2);
    expect(result.extraKm).toBe(0);
    expect(result.overtimeHours).toBe(0);
    expect(result.taxableValue).toBeCloseTo(30_967.74, 2);
  });

  it('does NOT reduce the fixed fee for a mid-month vehicle replacement (deployment stays continuous)', () => {
    const result = computeDedicatedMonthlySettlement({
      periodStart: JULY.start,
      periodEnd: JULY.end,
      deploymentStartDate: JULY.start,
      deploymentEndDate: null,
      segments: [
        { startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-15T00:00:00Z'), openingOdometer: 5_000, closingOdometer: 6_200 },
        { startDate: new Date('2026-07-16T00:00:00Z'), endDate: null, openingOdometer: 0, closingOdometer: 900 },
      ],
      rate: RATE,
      actualHours: 250,
      nightHaltCount: 0,
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    expect(result.activeDays).toBe(31);
    expect(result.daysInPeriod).toBe(31);
    expect(result.proratedFixedAmount).toBeCloseTo(60_000, 2); // full month, no proration
    expect(result.totalActualKm).toBe(2_100); // 1200 + 900
    expect(result.extraKm).toBe(0); // under 3,000 included
  });

  it('attributes km overage correctly across a vehicle replacement chain', () => {
    const result = computeDedicatedMonthlySettlement({
      periodStart: JULY.start,
      periodEnd: JULY.end,
      deploymentStartDate: JULY.start,
      deploymentEndDate: null,
      segments: [
        { startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-15T00:00:00Z'), openingOdometer: 5_000, closingOdometer: 7_000 }, // 2000 km
        { startDate: new Date('2026-07-16T00:00:00Z'), endDate: null, openingOdometer: 0, closingOdometer: 1_500 }, // 1500 km
      ],
      rate: RATE,
      actualHours: 250,
      nightHaltCount: 0,
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    expect(result.totalActualKm).toBe(3_500); // 2000 + 1500, summed across the chain
    expect(result.extraKm).toBe(500); // 3500 - 3000 included
    expect(result.extraKmCharge).toBeCloseTo(500 * 12, 2); // 6,000
    expect(result.taxableValue).toBeCloseTo(60_000 + 6_000, 2); // 66,000
  });

  it('prorates correctly for a CUSTOMER_FIXED_DUTY_MONTHLY deployment that ends mid-month (same engine, different counterparty)', () => {
    // Same function is used for a fixed-duty B2C customer as for a vendor —
    // this scenario deliberately exercises the OTHER edge (end-of-period
    // proration rather than start-of-period) to avoid a near-duplicate test.
    const result = computeDedicatedMonthlySettlement({
      periodStart: JULY.start,
      periodEnd: JULY.end,
      deploymentStartDate: JULY.start,
      deploymentEndDate: new Date('2026-07-20T00:00:00Z'), // customer terminated the arrangement mid-month
      segments: [
        { startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-20T00:00:00Z'), openingOdometer: 1_000, closingOdometer: 1_400 },
      ],
      rate: RATE,
      actualHours: 100,
      nightHaltCount: 0,
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    expect(result.activeDays).toBe(20); // 1st through 20th inclusive
    // 60,000 * 20/31 = 38,709.677... -> half-up to the paisa
    expect(result.proratedFixedAmount).toBeCloseTo(38_709.68, 2);
    expect(result.extraKm).toBe(0);
    expect(result.taxableValue).toBeCloseTo(38_709.68, 2);
  });

  it('applies reconciliation adjustments and batta/night-halt charges', () => {
    const result = computeDedicatedMonthlySettlement({
      periodStart: JULY.start,
      periodEnd: JULY.end,
      deploymentStartDate: JULY.start,
      deploymentEndDate: null,
      segments: [{ startDate: JULY.start, endDate: null, openingOdometer: 0, closingOdometer: 2_500 }],
      rate: RATE,
      actualHours: 300,
      nightHaltCount: 4,
      outstationBattaDays: 6,
      reconciliationAdjustment: -1_500, // vendor-agreed deduction after dispute resolution
    });

    expect(result.nightHaltCharge).toBeCloseTo(4 * 300, 2); // 1,200
    expect(result.battaCharge).toBeCloseTo(6 * 400, 2); // 2,400
    expect(result.taxableValue).toBeCloseTo(60_000 + 1_200 + 2_400 - 1_500, 2); // 62,100
  });

  it('throws if asked to settle a period containing an open (un-closed) segment', () => {
    expect(() =>
      computeDedicatedMonthlySettlement({
        periodStart: JULY.start,
        periodEnd: JULY.end,
        deploymentStartDate: JULY.start,
        deploymentEndDate: null,
        segments: [{ startDate: JULY.start, endDate: null, openingOdometer: 0, closingOdometer: null }],
        rate: RATE,
        actualHours: 0,
        nightHaltCount: 0,
        outstationBattaDays: 0,
        reconciliationAdjustment: 0,
      })
    ).toThrow();
  });
});
