import { describe, expect, it } from 'vitest';
import { validateDiscount, type DiscountThresholdMap } from './discountPolicy.js';

// Mirrors the seeded default in prisma/seed.ts (Setting key
// "booking.discount.maxPercentByRole") — not re-hardcoded in the engine
// itself, just used here to exercise the validation logic.
const THRESHOLDS: DiscountThresholdMap = {
  OPS: 5,
  MANAGER: 15,
  ACCOUNTS: 0,
  VIEWER: 0,
  OWNER: Infinity,
};

describe('validateDiscount', () => {
  it('allows OPS to discount up to their threshold', () => {
    const result = validateDiscount({ role: 'OPS', discountAmount: 500, baseAmount: 10_000, thresholds: THRESHOLDS });
    expect(result.allowed).toBe(true); // 5% of 10,000 = 500
  });

  it('rejects OPS exceeding their threshold', () => {
    const result = validateDiscount({ role: 'OPS', discountAmount: 501, baseAmount: 10_000, thresholds: THRESHOLDS });
    expect(result.allowed).toBe(false);
  });

  it('allows MANAGER a higher threshold than OPS', () => {
    const result = validateDiscount({ role: 'MANAGER', discountAmount: 1_500, baseAmount: 10_000, thresholds: THRESHOLDS });
    expect(result.allowed).toBe(true); // 15% of 10,000 = 1,500
  });

  it('allows OWNER unlimited discounts', () => {
    const result = validateDiscount({ role: 'OWNER', discountAmount: 9_999, baseAmount: 10_000, thresholds: THRESHOLDS });
    expect(result.allowed).toBe(true);
  });

  it('rejects any discount at all from ACCOUNTS/VIEWER', () => {
    expect(validateDiscount({ role: 'ACCOUNTS', discountAmount: 1, baseAmount: 10_000, thresholds: THRESHOLDS }).allowed).toBe(false);
    expect(validateDiscount({ role: 'VIEWER', discountAmount: 1, baseAmount: 10_000, thresholds: THRESHOLDS }).allowed).toBe(false);
  });
});
