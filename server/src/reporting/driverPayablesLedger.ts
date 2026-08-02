/**
 * Per-driver payout summary for a period — what the payroll run actually
 * needs: total payable by type, net amount (advances/adjustments can be
 * negative), ready to reconcile against `Driver.monthlySalary`/`perDutyRate`.
 */
export interface PayableEntryInput {
  driverId: string;
  driverName: string;
  type: 'BATTA' | 'NIGHT_HALT' | 'REIMBURSEMENT' | 'ADVANCE' | 'ADJUSTMENT';
  amount: number;
}

export interface DriverLedgerRow {
  driverId: string;
  driverName: string;
  byType: Record<PayableEntryInput['type'], number>;
  netAmount: number;
}

export function computeDriverPayablesLedger(entries: PayableEntryInput[]): DriverLedgerRow[] {
  const byDriver = new Map<string, DriverLedgerRow>();

  for (const entry of entries) {
    let row = byDriver.get(entry.driverId);
    if (!row) {
      row = {
        driverId: entry.driverId,
        driverName: entry.driverName,
        byType: { BATTA: 0, NIGHT_HALT: 0, REIMBURSEMENT: 0, ADVANCE: 0, ADJUSTMENT: 0 },
        netAmount: 0,
      };
      byDriver.set(entry.driverId, row);
    }
    row.byType[entry.type] += entry.amount;
    row.netAmount += entry.amount;
  }

  return Array.from(byDriver.values()).sort((a, b) => a.driverName.localeCompare(b.driverName));
}
