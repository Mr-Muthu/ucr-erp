import { describe, expect, it } from 'vitest';
import { computeProfitAndLoss } from './profitAndLoss.js';

describe('computeProfitAndLoss', () => {
  it('splits revenue into B2B (vendor/customer monthly) vs B2C (booking)', () => {
    const result = computeProfitAndLoss(
      [
        { type: 'VENDOR_MONTHLY', status: 'ISSUED', taxableValue: 60000 },
        { type: 'CUSTOMER_FIXED_DUTY_MONTHLY', status: 'PAID', taxableValue: 40000 },
        { type: 'BOOKING', status: 'ISSUED', taxableValue: 2200 },
      ],
      []
    );
    expect(result.revenue.b2b).toBe(100000);
    expect(result.revenue.b2c).toBe(2200);
    expect(result.revenue.total).toBe(102200);
  });

  it('excludes VOID invoices from revenue', () => {
    const result = computeProfitAndLoss(
      [
        { type: 'BOOKING', status: 'ISSUED', taxableValue: 2200 },
        { type: 'BOOKING', status: 'VOID', taxableValue: 5000 },
      ],
      []
    );
    expect(result.revenue.b2c).toBe(2200);
  });

  it('groups expenses by category and computes net profit', () => {
    const result = computeProfitAndLoss(
      [{ type: 'BOOKING', status: 'ISSUED', taxableValue: 10000 }],
      [
        { category: 'FUEL', amount: 2000 },
        { category: 'FUEL', amount: 500 },
        { category: 'TOLL', amount: 300 },
      ]
    );
    expect(result.expensesByCategory).toEqual({ FUEL: 2500, TOLL: 300 });
    expect(result.totalExpenses).toBe(2800);
    expect(result.netProfit).toBe(10000 - 2800);
  });
});
