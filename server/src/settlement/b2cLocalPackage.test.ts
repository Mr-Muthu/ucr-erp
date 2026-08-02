import { describe, expect, it } from 'vitest';
import { computeLocalPackageSettlement, type LocalPackageSlab } from './b2cLocalPackage.js';

const SLAB: LocalPackageSlab = {
  slabHours: 4,
  slabKm: 40,
  slabBaseRate: 1_200,
  extraKmRate: 15,
  extraHourRate: 100,
};

describe('computeLocalPackageSettlement', () => {
  it('charges exactly the slab base when actual usage lands exactly at the slab limit', () => {
    const result = computeLocalPackageSettlement({ slab: SLAB, actualHours: 4, actualKm: 40 });

    expect(result.extraKm).toBe(0);
    expect(result.extraHours).toBe(0);
    expect(result.taxableValue).toBeCloseTo(1_200, 2);
  });

  it('charges extras once usage exceeds the slab', () => {
    const result = computeLocalPackageSettlement({ slab: SLAB, actualHours: 5, actualKm: 55 });

    expect(result.extraKm).toBe(15);
    expect(result.extraHours).toBe(1);
    expect(result.extraKmCharge).toBeCloseTo(15 * 15, 2); // 225
    expect(result.extraHourCharge).toBeCloseTo(1 * 100, 2); // 100
    expect(result.taxableValue).toBeCloseTo(1_200 + 225 + 100, 2); // 1,525
  });

  it('never charges negative extras when usage is under the slab', () => {
    const result = computeLocalPackageSettlement({ slab: SLAB, actualHours: 2, actualKm: 25 });

    expect(result.extraKm).toBe(0);
    expect(result.extraHours).toBe(0);
    expect(result.taxableValue).toBeCloseTo(1_200, 2);
  });
});
