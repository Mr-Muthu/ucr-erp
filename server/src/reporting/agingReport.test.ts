import { describe, expect, it } from 'vitest';
import { computeAgingReport } from './agingReport.js';

const asOf = new Date('2026-08-01T00:00:00Z');

function invoice(overrides: Partial<Parameters<typeof computeAgingReport>[0][number]>) {
  return {
    id: 'inv-1',
    invoiceNumber: 'UCR/2026-27/00001',
    status: 'ISSUED',
    totalAmount: 10000,
    amountPaid: 0,
    issueDate: new Date('2026-07-01'),
    dueDate: new Date('2026-07-15') as Date | null,
    counterpartyName: 'Test Vendor',
    ...overrides,
  };
}

describe('computeAgingReport', () => {
  it('buckets by days overdue from dueDate', () => {
    const result = computeAgingReport(
      [
        invoice({ id: 'a', dueDate: new Date('2026-07-25') }), // 7 days -> 0-30
        invoice({ id: 'b', dueDate: new Date('2026-06-20') }), // 42 days -> 31-60
        invoice({ id: 'c', dueDate: new Date('2026-05-20') }), // 73 days -> 61-90
        invoice({ id: 'd', dueDate: new Date('2026-01-01') }), // way over -> 90+
      ],
      asOf
    );
    expect(result.rows.find((r) => r.id === 'a')?.bucket).toBe('0-30');
    expect(result.rows.find((r) => r.id === 'b')?.bucket).toBe('31-60');
    expect(result.rows.find((r) => r.id === 'c')?.bucket).toBe('61-90');
    expect(result.rows.find((r) => r.id === 'd')?.bucket).toBe('90+');
  });

  it('falls back to issueDate when dueDate is null', () => {
    const result = computeAgingReport([invoice({ dueDate: null, issueDate: new Date('2026-06-01') })], asOf);
    expect(result.rows[0]?.daysOverdue).toBe(61);
  });

  it('excludes PAID and VOID invoices, and fully-paid balances', () => {
    const result = computeAgingReport(
      [
        invoice({ id: 'paid', status: 'PAID', amountPaid: 10000 }),
        invoice({ id: 'void', status: 'VOID' }),
        invoice({ id: 'zero-balance', status: 'PARTIALLY_PAID', amountPaid: 10000 }), // balance 0 even though status isn't PAID
        invoice({ id: 'real', status: 'ISSUED', amountPaid: 3000 }),
      ],
      asOf
    );
    expect(result.rows.map((r) => r.id)).toEqual(['real']);
    expect(result.rows[0]?.balanceDue).toBe(7000);
  });

  it('sums totalsByBucket correctly across multiple invoices', () => {
    const result = computeAgingReport(
      [
        invoice({ id: 'a', dueDate: new Date('2026-07-25'), totalAmount: 1000 }),
        invoice({ id: 'b', dueDate: new Date('2026-07-20'), totalAmount: 2000 }),
      ],
      asOf
    );
    expect(result.totalsByBucket['0-30']).toBe(3000);
    expect(result.totalOutstanding).toBe(3000);
  });
});
