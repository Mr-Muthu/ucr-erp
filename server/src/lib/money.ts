/**
 * Money is never a float. Every arithmetic operation in the codebase must
 * go through this module. Internally we compute in paise (integer) to avoid
 * any binary-floating-point error, and only surface rupee values at the
 * boundary (DB writes via Prisma.Decimal, API responses).
 *
 * Deliberately has zero dependency on @prisma/client — this is pure,
 * reusable money math, not a database concern.
 *
 * GST rounding rule: half-up per line; invoice total rounded to the nearest
 * rupee with an explicit rounding line item (never silently absorbed).
 */

export type Paise = number; // always an integer

/** Structural type matching Prisma.Decimal / decimal.js without importing either. */
interface DecimalLike {
  toNumber(): number;
}

const PAISE_PER_RUPEE = 100;

export function rupeesToPaise(rupees: number | string | DecimalLike): Paise {
  const value = typeof rupees === 'object' ? rupees.toNumber() : Number(rupees);
  // Round to the nearest paisa before converting — inputs may arrive as
  // rupee decimals with more than 2 fractional digits from upstream math.
  return Math.round(value * PAISE_PER_RUPEE);
}

export function paiseToRupeeNumber(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

export function addPaise(...values: Paise[]): Paise {
  return values.reduce((sum, v) => sum + v, 0);
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  return a - b;
}

export function multiplyPaise(paise: Paise, factor: number): Paise {
  return Math.round(paise * factor);
}

/** max(0, a - b), in paise or any integer unit — used throughout for overage math. */
export function positiveDiff(a: number, b: number): number {
  return Math.max(0, a - b);
}

/** Half-up rounding to the nearest paisa (2 decimal places), as required for GST line rounding. */
export function roundHalfUpToPaisa(rupees: number): number {
  return Math.round((rupees + Number.EPSILON) * PAISE_PER_RUPEE) / PAISE_PER_RUPEE;
}

/** Half-up rounding to the nearest whole rupee, returning both the rounded
 * total and the (possibly negative) rounding adjustment applied, so callers
 * can persist it as an explicit invoice line item. */
export function roundInvoiceTotal(exactRupees: number): { roundedTotal: number; roundingAdjustment: number } {
  const roundedTotal = Math.round(exactRupees);
  const roundingAdjustment = roundHalfUpToPaisa(roundedTotal - exactRupees);
  return { roundedTotal, roundingAdjustment };
}

export interface GstSplit {
  taxType: 'CGST_SGST' | 'IGST';
  gstRatePct: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

/**
 * Computes CGST+SGST vs IGST per standard Indian GST place-of-supply rule:
 * same state as the supplier => intra-state (CGST+SGST split evenly),
 * different state => inter-state (IGST, full rate). Not a business
 * judgment call — this is fixed by law, not a configurable setting.
 */
export function computeGst(params: {
  taxableValue: number;
  gstRatePct: number;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
}): GstSplit {
  const { taxableValue, gstRatePct, supplierStateCode, placeOfSupplyStateCode } = params;
  const isIntraState = supplierStateCode === placeOfSupplyStateCode;
  const totalTax = roundHalfUpToPaisa(taxableValue * (gstRatePct / 100));

  if (isIntraState) {
    const half = roundHalfUpToPaisa(totalTax / 2);
    return {
      taxType: 'CGST_SGST',
      gstRatePct,
      taxableValue,
      cgstAmount: half,
      sgstAmount: totalTax - half,
      igstAmount: 0,
      totalTax,
    };
  }

  return {
    taxType: 'IGST',
    gstRatePct,
    taxableValue,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: totalTax,
    totalTax,
  };
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ' ' + ONES[ones] : ''}`;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitsToWords(rest));
  return parts.join(' ');
}

/** Amount in words, Indian numbering system (lakh/crore), for GST invoice printing. */
export function amountInWordsIndian(rupees: number): string {
  const whole = Math.round(rupees);
  if (whole === 0) return 'Rupees Zero Only';

  const crore = Math.floor(whole / 1_00_00_000);
  const lakh = Math.floor((whole % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((whole % 1_00_000) / 1_000);
  const hundred = whole % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));

  return `Rupees ${parts.join(' ')} Only`;
}
