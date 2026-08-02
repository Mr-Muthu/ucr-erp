/**
 * Standard 0-30/31-60/61-90/90+ day aging buckets, measured from
 * `dueDate` (falling back to `issueDate` for invoices with no explicit due
 * date — e.g. some B2C bookings settled on the spot). Only invoices with a
 * genuine balance owed are included; PAID/VOID never appear here.
 */
export interface AgingInvoiceInput {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  issueDate: Date;
  dueDate: Date | null;
  counterpartyName: string;
}

export interface AgingBucketRow extends AgingInvoiceInput {
  balanceDue: number;
  daysOverdue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
}

export interface AgingReportResult {
  rows: AgingBucketRow[];
  totalsByBucket: Record<'0-30' | '31-60' | '61-90' | '90+', number>;
  totalOutstanding: number;
}

function bucketFor(daysOverdue: number): AgingBucketRow['bucket'] {
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

export function computeAgingReport(invoices: AgingInvoiceInput[], asOf: Date): AgingReportResult {
  const rows: AgingBucketRow[] = invoices
    .filter((inv) => inv.status !== 'PAID' && inv.status !== 'VOID')
    .map((inv) => {
      const balanceDue = inv.totalAmount - inv.amountPaid;
      const referenceDate = inv.dueDate ?? inv.issueDate;
      const daysOverdue = Math.max(0, Math.floor((asOf.getTime() - referenceDate.getTime()) / 86_400_000));
      return { ...inv, balanceDue, daysOverdue, bucket: bucketFor(daysOverdue) };
    })
    .filter((row) => row.balanceDue > 0);

  const totalsByBucket: AgingReportResult['totalsByBucket'] = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const row of rows) totalsByBucket[row.bucket] += row.balanceDue;

  return { rows, totalsByBucket, totalOutstanding: rows.reduce((sum, r) => sum + r.balanceDue, 0) };
}
