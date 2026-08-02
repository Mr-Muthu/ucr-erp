import { describe, expect, it } from 'vitest';
import { renderInvoicePdf, type InvoicePdfData } from './invoicePdf.js';
import { renderCreditNotePdf, type CreditNotePdfData } from './creditNotePdf.js';

const sampleInvoice: InvoicePdfData = {
  invoiceNumber: 'UCR/2026-27/00001',
  type: 'VENDOR_MONTHLY',
  issueDate: new Date('2026-08-01'),
  dueDate: new Date('2026-08-15'),
  supplierName: 'Ulagammal Car Rental',
  supplierGstin: '27AAAAA0000A1Z5',
  supplierAddress: 'Hinjewadi, Pune, Maharashtra',
  recipientName: 'Skyline Corporate Travel Pvt Ltd',
  recipientGstin: '27BBBBB1111B1Z5',
  placeOfSupplyStateCode: '27',
  taxType: 'CGST_SGST',
  lineItems: [
    { description: 'Dedicated monthly deployment', hsnSac: '996601', quantity: 1, unitRate: 60000, taxableValue: 60000, gstRatePct: 18, lineTotal: 70800 },
  ],
  taxableValue: 60000,
  cgstAmount: 5400,
  sgstAmount: 5400,
  igstAmount: 0,
  roundingAdjustment: 0,
  totalAmount: 70800,
  amountPaid: 0,
};

describe('renderInvoicePdf', () => {
  it('produces a well-formed PDF buffer', async () => {
    const buffer = await renderInvoicePdf(sampleInvoice);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500); // a real rendered page, not an empty stub
  });

  it('handles IGST (inter-state) invoices without touching CGST/SGST fields', async () => {
    const buffer = await renderInvoicePdf({ ...sampleInvoice, taxType: 'IGST', igstAmount: 10800, cgstAmount: 0, sgstAmount: 0 });
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('handles an unregistered recipient (no GSTIN)', async () => {
    const buffer = await renderInvoicePdf({ ...sampleInvoice, recipientGstin: null });
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

const sampleCreditNote: CreditNotePdfData = {
  creditNoteNumber: 'UCR-CN/2026-27/00001',
  againstInvoiceNumber: 'UCR/2026-27/00001',
  reason: 'Duplicate billing correction',
  issueDate: new Date('2026-08-05'),
  supplierName: 'Ulagammal Car Rental',
  supplierGstin: '27AAAAA0000A1Z5',
  recipientName: 'Skyline Corporate Travel Pvt Ltd',
  recipientGstin: '27BBBBB1111B1Z5',
  lineItems: [{ description: 'Reversal: Dedicated monthly deployment', amount: 70800 }],
  taxableValue: 60000,
  cgstAmount: 5400,
  sgstAmount: 5400,
  igstAmount: 0,
  totalAmount: 70800,
  taxType: 'CGST_SGST',
};

describe('renderCreditNotePdf', () => {
  it('produces a well-formed PDF buffer', async () => {
    const buffer = await renderCreditNotePdf(sampleCreditNote);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(300);
  });
});
