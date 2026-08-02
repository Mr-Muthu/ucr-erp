import PDFDocument from 'pdfkit';
import { formatDate, formatRupees } from './format.js';

export interface CreditNotePdfData {
  creditNoteNumber: string;
  againstInvoiceNumber: string;
  reason: string;
  issueDate: Date;
  supplierName: string;
  supplierGstin: string;
  recipientName: string;
  recipientGstin: string | null;
  lineItems: Array<{ description: string; amount: number | string }>;
  taxableValue: number | string;
  cgstAmount: number | string;
  sgstAmount: number | string;
  igstAmount: number | string;
  totalAmount: number | string;
  taxType: 'CGST_SGST' | 'IGST';
}

export function renderCreditNotePdf(data: CreditNotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('CREDIT NOTE', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text(data.supplierName);
    doc.font('Helvetica').text(`GSTIN: ${data.supplierGstin}`);
    doc.moveDown(0.5);

    const topY = doc.y;
    doc.font('Helvetica-Bold').text('Credit Note No.:', 40, topY, { continued: true }).font('Helvetica').text(` ${data.creditNoteNumber}`);
    doc.font('Helvetica-Bold').text('Against Invoice:', 40, doc.y, { continued: true }).font('Helvetica').text(` ${data.againstInvoiceNumber}`);
    doc.font('Helvetica-Bold').text('Issue Date:', 40, doc.y, { continued: true }).font('Helvetica').text(` ${formatDate(data.issueDate)}`);
    doc.font('Helvetica-Bold').text('Reason:', 40, doc.y, { continued: true }).font('Helvetica').text(` ${data.reason}`);

    doc.font('Helvetica-Bold').text('Issued To:', 320, topY);
    doc.font('Helvetica').text(data.recipientName, 320, doc.y);
    doc.text(`GSTIN: ${data.recipientGstin ?? 'Unregistered'}`, 320);

    doc.moveDown(1.5);

    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Description', 40, tableTop, { width: 400 });
    doc.text('Amount', 470, tableTop, { width: 85, align: 'right' });
    doc.moveTo(40, doc.y + 3).lineTo(555, doc.y + 3).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9);
    for (const item of data.lineItems) {
      const rowY = doc.y;
      doc.text(item.description, 40, rowY, { width: 400 });
      doc.text(formatRupees(item.amount), 470, rowY, { width: 85, align: 'right' });
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
    summaryLine('Total Credited', formatRupees(data.totalAmount), true);

    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica-Oblique').text('This is a computer-generated credit note and does not require a signature.', 40, doc.y, { align: 'center' });

    doc.end();
  });
}
