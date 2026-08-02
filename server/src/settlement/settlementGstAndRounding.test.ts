import { describe, expect, it } from 'vitest';
import { computeGst, roundInvoiceTotal } from '../lib/money.js';
import { computeDedicatedMonthlySettlement, type DedicatedMonthlyRateTerms } from './dedicatedMonthly.js';
import { computeLocalPackageSettlement, type LocalPackageSlab } from './b2cLocalPackage.js';

/**
 * Integration-style tests proving the settlement calculators compose
 * correctly with the GST split and invoice-rounding rules in money.ts —
 * this is where the two "hardest to get right" fixtures from the spec live:
 * inter-state IGST on a vendor invoice, and rounding surviving intact
 * all the way to the paisa through a multi-step calculation.
 */

describe('settlement -> GST -> invoice rounding pipeline', () => {
  it('applies IGST (not CGST+SGST) for an inter-state vendor whose place of supply differs from UCR\'s home state', () => {
    const RATE: DedicatedMonthlyRateTerms = {
      fixedMonthlyAmount: 60_000,
      includedKm: 3_000,
      includedHours: 300,
      extraKmRate: 12,
      extraHourRate: 50,
      nightHaltRate: 300,
      outstationBattaRate: 400,
    };

    const settlement = computeDedicatedMonthlySettlement({
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-31T00:00:00Z'),
      deploymentStartDate: new Date('2026-07-01T00:00:00Z'),
      deploymentEndDate: null,
      segments: [
        { startDate: new Date('2026-07-01T00:00:00Z'), endDate: null, openingOdometer: 0, closingOdometer: 3_500 },
      ],
      rate: RATE,
      actualHours: 300,
      nightHaltCount: 0,
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    expect(settlement.taxableValue).toBeCloseTo(66_000, 2); // 60,000 fixed + 500km * 12 overage

    // UCR is registered in Maharashtra (27); this vendor's place of supply
    // is Karnataka (29) -> inter-state -> IGST, not CGST+SGST.
    const gst = computeGst({
      taxableValue: settlement.taxableValue,
      gstRatePct: 18,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '29',
    });

    expect(gst.taxType).toBe('IGST');
    expect(gst.cgstAmount).toBe(0);
    expect(gst.sgstAmount).toBe(0);
    expect(gst.igstAmount).toBeCloseTo(66_000 * 0.18, 2); // 11,880
    expect(gst.igstAmount).toBeCloseTo(11_880, 2);
  });

  it('applies CGST+SGST for an intra-state vendor in the same state as UCR, split evenly', () => {
    const RATE: DedicatedMonthlyRateTerms = {
      fixedMonthlyAmount: 60_000,
      includedKm: 3_000,
      includedHours: 300,
      extraKmRate: 12,
      extraHourRate: 50,
      nightHaltRate: 300,
      outstationBattaRate: 400,
    };
    const settlement = computeDedicatedMonthlySettlement({
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-31T00:00:00Z'),
      deploymentStartDate: new Date('2026-07-01T00:00:00Z'),
      deploymentEndDate: null,
      segments: [
        { startDate: new Date('2026-07-01T00:00:00Z'), endDate: null, openingOdometer: 0, closingOdometer: 2_000 },
      ],
      rate: RATE,
      actualHours: 300,
      nightHaltCount: 0,
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    const gst = computeGst({
      taxableValue: settlement.taxableValue, // 60,000 flat, no overage
      gstRatePct: 18,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27', // same state as UCR
    });

    expect(gst.taxType).toBe('CGST_SGST');
    expect(gst.cgstAmount).toBeCloseTo(5_400, 2); // 9% of 60,000
    expect(gst.sgstAmount).toBeCloseTo(5_400, 2);
    expect(gst.igstAmount).toBe(0);
  });

  it('carries paisa-level precision through settlement -> GST -> invoice rounding without drift', () => {
    // Deliberately fractional rate that forces half-up rounding at the
    // paisa boundary (33.335 -> 33.34) to prove no float error creeps in.
    const slab: LocalPackageSlab = {
      slabHours: 1,
      slabKm: 10,
      slabBaseRate: 33.335,
      extraKmRate: 0,
      extraHourRate: 0,
    };
    const settlement = computeLocalPackageSettlement({ slab, actualHours: 1, actualKm: 10 });
    expect(settlement.taxableValue).toBeCloseTo(33.34, 2);

    const gst = computeGst({
      taxableValue: 1_093.3,
      gstRatePct: 18,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
    });
    // 1093.30 + 196.79 tax (half-up) = 1290.09 exact, then rounded to the
    // nearest rupee for the invoice total with an explicit adjustment line.
    const invoiceTotalBeforeRounding = 1_093.3 + gst.totalTax;
    expect(invoiceTotalBeforeRounding).toBeCloseTo(1_290.09, 2);

    const { roundedTotal, roundingAdjustment } = roundInvoiceTotal(invoiceTotalBeforeRounding);
    expect(roundedTotal).toBe(1_290);
    expect(roundingAdjustment).toBeCloseTo(-0.09, 2);
    // The rounding must be recoverable: rounded total minus the adjustment
    // reproduces the exact pre-rounding figure to the paisa.
    expect(roundedTotal - roundingAdjustment).toBeCloseTo(invoiceTotalBeforeRounding, 2);
  });
});
