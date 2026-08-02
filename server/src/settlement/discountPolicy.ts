/**
 * Permission-gated discount validation for B2C booking settlement.
 * Thresholds are NOT hardcoded here — they're read from the `Setting` table
 * (key: "booking.discount.maxPercentByRole") and passed in, per the
 * delivery-discipline rule that business numbers this doc doesn't fix
 * become configurable settings with a stated default. See prisma/seed.ts
 * for the seeded default: OPS 5%, MANAGER 15%, ACCOUNTS/VIEWER 0%,
 * OWNER unlimited (modelled as Infinity, not a magic 100).
 */

export type DiscountRole = 'OWNER' | 'MANAGER' | 'OPS' | 'ACCOUNTS' | 'VIEWER';

export type DiscountThresholdMap = Record<DiscountRole, number>; // percent, Infinity = unlimited

export interface DiscountValidationResult {
  allowed: boolean;
  maxAllowedAmount: number;
  requestedPercent: number;
  maxAllowedPercent: number;
}

export function validateDiscount(params: {
  role: DiscountRole;
  discountAmount: number;
  baseAmount: number;
  thresholds: DiscountThresholdMap;
}): DiscountValidationResult {
  const { role, discountAmount, baseAmount, thresholds } = params;
  const maxAllowedPercent = thresholds[role];
  const requestedPercent = baseAmount === 0 ? 0 : (discountAmount / baseAmount) * 100;
  const maxAllowedAmount = maxAllowedPercent === Infinity ? baseAmount : (baseAmount * maxAllowedPercent) / 100;

  return {
    allowed: discountAmount <= maxAllowedAmount + 1e-9, // tolerate float epsilon on the comparison only
    maxAllowedAmount: Math.round(maxAllowedAmount * 100) / 100,
    requestedPercent,
    maxAllowedPercent,
  };
}
