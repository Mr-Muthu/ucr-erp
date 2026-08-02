/**
 * GSTIN format + checksum validation (Indian GST identification number).
 * Format: 2-digit state code + 10-char PAN + 1-digit entity code + 'Z' +
 * 1 checksum character, using the standard mod-36 Luhn-style algorithm.
 */

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstinFormat(gstin: string): boolean {
  return GSTIN_FORMAT.test(gstin);
}

function computeCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const charIndex = GSTIN_CHARSET.indexOf(first14[i] as string);
    if (charIndex === -1) throw new Error(`Invalid GSTIN character: ${first14[i]}`);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = charIndex * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkValue = (36 - (sum % 36)) % 36;
  return GSTIN_CHARSET[checkValue] as string;
}

export function isValidGstinChecksum(gstin: string): boolean {
  if (gstin.length !== 15) return false;
  try {
    return computeCheckDigit(gstin.slice(0, 14)) === gstin[14];
  } catch {
    return false;
  }
}

export function isValidGstin(gstin: string): boolean {
  return isValidGstinFormat(gstin) && isValidGstinChecksum(gstin);
}

/** Test/seed helper: builds a checksum-valid GSTIN from a 14-char prefix. */
export function buildValidGstin(first14: string): string {
  if (first14.length !== 14) throw new Error('GSTIN prefix must be exactly 14 characters');
  return `${first14}${computeCheckDigit(first14)}`;
}
