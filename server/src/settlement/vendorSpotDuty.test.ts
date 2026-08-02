import { describe, expect, it } from 'vitest';
import { computeVendorSpotDutySettlement, type VendorSpotDutySlab } from './vendorSpotDuty.js';

const SLAB: VendorSpotDutySlab = {
  slabHours: 8,
  slabKm: 80,
  slabBaseRate: 2_200,
  extraKmRateSpot: 14,
  extraHourRateSpot: 120,
};

describe('computeVendorSpotDutySettlement', () => {
  it('charges exactly the slab base when actual km/hours land exactly on the boundary', () => {
    const result = computeVendorSpotDutySettlement({
      slab: SLAB,
      actualHours: 8,
      actualKm: 80,
      tollsAndParkingAmount: 0,
      tollsAndParkingTaxable: true,
    });

    expect(result.extraKm).toBe(0);
    expect(result.extraHours).toBe(0);
    expect(result.baseCharge).toBeCloseTo(2_200, 2);
    expect(result.taxableValue).toBeCloseTo(2_200, 2);
  });

  it('charges extras for the first km/hour past the slab boundary (no off-by-one)', () => {
    const result = computeVendorSpotDutySettlement({
      slab: SLAB,
      actualHours: 8.5,
      actualKm: 85,
      tollsAndParkingAmount: 0,
      tollsAndParkingTaxable: true,
    });

    expect(result.extraKm).toBe(5);
    expect(result.extraHours).toBe(0.5);
    expect(result.extraKmCharge).toBeCloseTo(5 * 14, 2); // 70
    expect(result.extraHourCharge).toBeCloseTo(0.5 * 120, 2); // 60
    expect(result.taxableValue).toBeCloseTo(2_200 + 70 + 60, 2); // 2,330
  });

  it('keeps toll/parking pass-through out of the taxable value when configured non-taxable', () => {
    const result = computeVendorSpotDutySettlement({
      slab: SLAB,
      actualHours: 8,
      actualKm: 80,
      tollsAndParkingAmount: 150,
      tollsAndParkingTaxable: false,
    });

    expect(result.taxableValue).toBeCloseTo(2_200, 2); // tolls excluded
    expect(result.nonTaxablePassThrough).toBeCloseTo(150, 2);
  });

  it('includes toll/parking pass-through in the taxable value when configured taxable', () => {
    const result = computeVendorSpotDutySettlement({
      slab: SLAB,
      actualHours: 8,
      actualKm: 80,
      tollsAndParkingAmount: 150,
      tollsAndParkingTaxable: true,
    });

    expect(result.taxableValue).toBeCloseTo(2_350, 2);
    expect(result.nonTaxablePassThrough).toBe(0);
  });
});
