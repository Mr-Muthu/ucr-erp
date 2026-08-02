/**
 * GSTR-1-style period summary: taxable value + tax totals split by tax
 * type (CGST/SGST for intra-state, IGST for inter-state), the shape a GST
 * return actually needs. VOID invoices are excluded — their CreditNote is
 * the reversal that keeps the return correct, not a re-summed original.
 */
export interface GstSummaryInvoiceInput {
  status: string;
  taxType: 'CGST_SGST' | 'IGST';
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

export interface GstSummaryResult {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  totalInvoiceValue: number;
  invoiceCount: number;
}

export function computeGstSummary(invoices: GstSummaryInvoiceInput[]): GstSummaryResult {
  const live = invoices.filter((i) => i.status !== 'VOID');
  const result = live.reduce(
    (acc, inv) => ({
      taxableValue: acc.taxableValue + inv.taxableValue,
      cgstAmount: acc.cgstAmount + inv.cgstAmount,
      sgstAmount: acc.sgstAmount + inv.sgstAmount,
      igstAmount: acc.igstAmount + inv.igstAmount,
      totalInvoiceValue: acc.totalInvoiceValue + inv.totalAmount,
    }),
    { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalInvoiceValue: 0 }
  );
  return { ...result, totalTax: result.cgstAmount + result.sgstAmount + result.igstAmount, invoiceCount: live.length };
}
