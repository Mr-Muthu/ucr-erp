import { describe, expect, it } from 'vitest';
import { computeOutstationSettlement, type OutstationRate } from './b2cOutstation.js';

const RATE: OutstationRate = {
  perKmRate: 13,
  minKmPerDay: 250,
  driverBattaPerDay: 400,
  nightHaltRate: 300,
};

describe('computeOutstationSettlement', () => {
  it('bills the min-km/day floor when actual km falls short of it', () => {
    const result = computeOutstationSettlement({
      rate: RATE,
      days: 3,
      actualKm: 600, // floor is 3 * 250 = 750, so this should be billed at 750
      nightHaltCount: 2,
      tollsAndParkingAmount: 200,
    });

    expect(result.kmFloorApplied).toBe(true);
    expect(result.billableKm).toBe(750);
    expect(result.kmCharge).toBeCloseTo(750 * 13, 2); // 9,750
    expect(result.battaCharge).toBeCloseTo(3 * 400, 2); // 1,200
    expect(result.nightHaltCharge).toBeCloseTo(2 * 300, 2); // 600
    expect(result.taxableValue).toBeCloseTo(9_750 + 1_200 + 600 + 200, 2); // 11,750
  });

  it('bills actual km when it exceeds the floor', () => {
    const result = computeOutstationSettlement({
      rate: RATE,
      days: 2,
      actualKm: 600, // floor is 2 * 250 = 500, actual exceeds it
      nightHaltCount: 0,
      tollsAndParkingAmount: 0,
    });

    expect(result.kmFloorApplied).toBe(false);
    expect(result.billableKm).toBe(600);
    expect(result.kmCharge).toBeCloseTo(600 * 13, 2); // 7,800
  });

  it('bills exactly the floor when actual km equals it (boundary)', () => {
    const result = computeOutstationSettlement({
      rate: RATE,
      days: 2,
      actualKm: 500,
      nightHaltCount: 0,
      tollsAndParkingAmount: 0,
    });

    expect(result.kmFloorApplied).toBe(false); // billableKm === actualKm, floor not "applied" in the sense of raising it
    expect(result.billableKm).toBe(500);
  });
});
