import PDFDocument from 'pdfkit';
import { formatDate, formatRupees } from './format.js';

export interface InvoicePdfLineItem {
  description: string;
  hsnSac: string;
  quantity: number | string;
  unitRate: number | string;
  taxableValue: number | string;
  gstRatePct: number | string;
  lineTotal: number | string;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  type: string;
  issueDate: Date;
  dueDate: Date | null;
  supplierName: string;
  supplierGstin: string;
  supplierAddress: string;
  recipientName: string;
  recipientGstin: string | null;
  placeOfSupplyStateCode: string;
  taxType: 'CGST_SGST' | 'IGST';
  lineItems: InvoicePdfLineItem[];
  taxableValue: number | string;
  cgstAmount: number | string;
  sgstAmount: number | string;
  igstAmount: number | string;
  roundingAdjustment: number | string;
  totalAmount: number | string;
  amountPaid: number | string;
}

/**
 * Pure function: Prisma data in, PDF bytes out — no DB access here, so it's
 * directly unit-testable (renders can be diffed by byte length / parsed
 * text without a live database), mirroring the settlement/ calculators.
 */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text(data.supplierName);
    doc.font('Helvetica').text(data.supplierAddress);
    doc.text(`GSTIN: ${data.supplierGstin}`);
    doc.moveDown(0.5);

    const topY = doc.y;
    doc.font('Helvetica-Bold').text('Invoice Number:', 40, topY, { continued: true }).font('Helvetica').text(` ${data.invoiceNumber}`);
    doc.font('Helvetica-Bold').text('Issue Date:', 40, doc.y, { continued: true }).font('Helvetica').text(` ${formatDate(data.issueDate)}`);
    if (data.dueDate) doc.font('Helvetica-Bold').text('Due Date:', 40, doc.y, { continued: true }).font('Helvetica').text(` ${formatDate(data.dueDate)}`);
    doc.font('Helvetica-Bold').text('Place of Supply:', 40, doc.y, { continued: true }).font('Helvetica').text(` ${data.placeOfSupplyStateCode}`);

    doc.font('Helvetica-Bold').text('Bill To:', 320, topY);
    doc.font('Helvetica').text(data.recipientName, 320, doc.y);
    doc.text(`GSTIN: ${data.recipientGstin ?? 'Unregistered'}`, 320);

    doc.moveDown(1.5);

    // Table header
    const tableTop = doc.y;
    const cols = { desc: 40, hsn: 220, qty: 280, rate: 320, taxable: 380, gst: 440, total: 480 };
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Description', cols.desc, tableTop, { width: 175 });
    doc.text('HSN/SAC', cols.hsn, tableTop, { width: 55 });
    doc.text('Qty', cols.qty, tableTop, { width: 35, align: 'right' });
    doc.text('Rate', cols.rate, tableTop, { width: 55, align: 'right' });
    doc.text('Taxable', cols.taxable, tableTop, { width: 55, align: 'right' });
    doc.text('GST%', cols.gst, tableTop, { width: 35, align: 'right' });
    doc.text('Total', cols.total, tableTop, { width: 75, align: 'right' });
    doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9);
    for (const item of data.lineItems) {
      const rowY = doc.y;
      doc.text(item.description, cols.desc, rowY, { width: 175 });
      doc.text(item.hsnSac, cols.hsn, rowY, { width: 55 });
      doc.text(String(item.quantity), cols.qty, rowY, { width: 35, align: 'right' });
      doc.text(formatRupees(item.unitRate), cols.rate, rowY, { width: 55, align: 'right' });
      doc.text(formatRupees(item.taxableValue), cols.taxable, rowY, { width: 55, align: 'right' });
      doc.text(`${item.gstRatePct}%`, cols.gst, rowY, { width: 35, align: 'right' });
      doc.text(formatRupees(item.lineTotal), cols.total, rowY, { width: 75, align: 'right' });
      doc.moveDown(0.7);
    }

    doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).stroke();
    doc.moveDown(1);

    const summaryX = 380;
    function summaryLine(label: string, value: string, bold = false) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
      doc.text(label, summaryX, doc.y, { width: 100 });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(value, summaryX + 100, doc.y - doc.currentLineHeight(), { width: 75, align: 'right' });
      doc.moveDown(0.4);
    }

    summaryLine('Taxable Value', formatRupees(data.taxableValue));
    if (data.taxType === 'CGST_SGST') {
      summaryLine('CGST', formatRupees(data.cgstAmount));
      summaryLine('SGST', formatRupees(data.sgstAmount));
    } else {
      summaryLine('IGST', formatRupees(data.igstAmount));
    }
    summaryLine('Rounding', formatRupees(data.roundingAdjustment));
    summaryLine('Total', formatRupees(data.totalAmount), true);
    summaryLine('Paid', formatRupees(data.amountPaid));
    summaryLine('Balance Due', formatRupees(Number(data.totalAmount) - Number(data.amountPaid)), true);

    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica-Oblique').text('This is a computer-generated invoice and does not require a signature.', 40, doc.y, { align: 'center' });

    doc.end();
  });
}
