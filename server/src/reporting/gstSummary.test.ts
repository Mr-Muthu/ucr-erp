import { describe, expect, it } from 'vitest';
import { computeGstSummary } from './gstSummary.js';

describe('computeGstSummary', () => {
  it('sums taxable value and tax amounts across both tax types', () => {
    const result = computeGstSummary([
      { status: 'ISSUED', taxType: 'CGST_SGST', taxableValue: 60000, cgstAmount: 5400, sgstAmount: 5400, igstAmount: 0, totalAmount: 70800 },
      { status: 'PAID', taxType: 'IGST', taxableValue: 10000, cgstAmount: 0, sgstAmount: 0, igstAmount: 1800, totalAmount: 11800 },
    ]);
    expect(result.taxableValue).toBe(70000);
    expect(result.cgstAmount).toBe(5400);
    expect(result.sgstAmount).toBe(5400);
    expect(result.igstAmount).toBe(1800);
    expect(result.totalTax).toBe(12600);
    expect(result.totalInvoiceValue).toBe(82600);
    expect(result.invoiceCount).toBe(2);
  });

  it('excludes VOID invoices entirely', () => {
    const result = computeGstSummary([
      { status: 'ISSUED', taxType: 'CGST_SGST', taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, totalAmount: 1180 },
      { status: 'VOID', taxType: 'CGST_SGST', taxableValue: 5000, cgstAmount: 450, sgstAmount: 450, igstAmount: 0, totalAmount: 5900 },
    ]);
    expect(result.taxableValue).toBe(1000);
    expect(result.invoiceCount).toBe(1);
  });

  it('returns all zeros for an empty period', () => {
    const result = computeGstSummary([]);
    expect(result).toEqual({ taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalInvoiceValue: 0, invoiceCount: 0 });
  });
});
