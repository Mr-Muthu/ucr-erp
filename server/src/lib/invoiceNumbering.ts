import type { Prisma } from '@prisma/client';
import { getFinancialYear } from './financialYear.js';

/**
 * Gap-free-in-practice sequential numbering per financial year, e.g.
 * UCR/2026-27/00001. Uses an atomic upsert-increment (Postgres executes
 * INSERT ... ON CONFLICT DO UPDATE SET lastNumber = lastNumber + 1 as one
 * atomic statement) rather than a raw SEQUENCE object, which can skip
 * numbers on a rolled-back transaction — must be called inside the same
 * $transaction as the Invoice/CreditNote creation it numbers.
 */
export async function nextSequenceNumber(tx: Prisma.TransactionClient, series: 'INVOICE' | 'CREDIT_NOTE', date: Date): Promise<{ financialYear: string; sequenceNumber: number }> {
  const financialYear = getFinancialYear(date);
  const seq = await tx.numberingSequence.upsert({
    where: { series_financialYear: { series, financialYear } },
    update: { lastNumber: { increment: 1 } },
    create: { series, financialYear, lastNumber: 1 },
  });
  return { financialYear, sequenceNumber: seq.lastNumber };
}

export function formatInvoiceNumber(financialYear: string, sequenceNumber: number): string {
  return `UCR/${financialYear}/${String(sequenceNumber).padStart(5, '0')}`;
}

export function formatCreditNoteNumber(financialYear: string, sequenceNumber: number): string {
  return `UCR-CN/${financialYear}/${String(sequenceNumber).padStart(5, '0')}`;
}
