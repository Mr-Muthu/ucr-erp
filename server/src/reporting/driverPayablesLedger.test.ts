import { describe, expect, it } from 'vitest';
import { computeDriverPayablesLedger } from './driverPayablesLedger.js';

describe('computeDriverPayablesLedger', () => {
  it('aggregates multiple entries per driver by type', () => {
    const rows = computeDriverPayablesLedger([
      { driverId: 'd1', driverName: 'Ramesh Kumar', type: 'BATTA', amount: 500 },
      { driverId: 'd1', driverName: 'Ramesh Kumar', type: 'BATTA', amount: 300 },
      { driverId: 'd1', driverName: 'Ramesh Kumar', type: 'NIGHT_HALT', amount: 250 },
      { driverId: 'd1', driverName: 'Ramesh Kumar', type: 'ADVANCE', amount: -2000 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      driverId: 'd1',
      byType: { BATTA: 800, NIGHT_HALT: 250, REIMBURSEMENT: 0, ADVANCE: -2000, ADJUSTMENT: 0 },
      netAmount: 800 + 250 - 2000,
    });
  });

  it('keeps separate drivers separate and sorts by name', () => {
    const rows = computeDriverPayablesLedger([
      { driverId: 'd2', driverName: 'Suresh Patil', type: 'BATTA', amount: 100 },
      { driverId: 'd1', driverName: 'Ramesh Kumar', type: 'BATTA', amount: 200 },
    ]);
    expect(rows.map((r) => r.driverName)).toEqual(['Ramesh Kumar', 'Suresh Patil']);
  });

  it('returns an empty array for no entries', () => {
    expect(computeDriverPayablesLedger([])).toEqual([]);
  });
});
