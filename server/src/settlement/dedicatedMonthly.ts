import { addPaise, multiplyPaise, positiveDiff, roundHalfUpToPaisa, rupeesToPaise, paiseToRupeeNumber } from '../lib/money.js';
import { clipToPeriod, daysInclusive } from './dateMath.js';

/**
 * Shared settlement engine for BOTH vendor DEDICATED_MONTHLY deployments and
 * customer FIXED_DUTY_MONTHLY deployments — per spec, "identical engine
 * ... one code path, tested once, used for both." The only difference
 * between the two is which rate-card shape feeds these numbers in
 * (VendorRateCardItem vs RateCardItem) and which counterparty the resulting
 * invoice is issued to — both handled by the Phase 2 API layer, not here.
 */

export interface DeploymentSegmentInput {
  /** Segment start, clipped to the billing period by the caller is NOT required — this function clips internally. */
  startDate: Date;
  /** null = still ongoing (open-ended, current vehicle in the replacement chain). */
  endDate: Date | null;
  openingOdometer: number;
  /** null only valid if the segment is still ongoing at settlement time (should not happen for a finalized period). */
  closingOdometer: number | null;
}

export interface DedicatedMonthlyRateTerms {
  fixedMonthlyAmount: number;
  includedKm: number;
  includedHours: number;
  extraKmRate: number;
  extraHourRate: number;
  nightHaltRate: number;
  outstationBattaRate: number;
}

export interface DedicatedMonthlySettlementInput {
  periodStart: Date;
  periodEnd: Date; // inclusive
  /** The deployment's own active window — may be narrower than the period (start/end mid-month). */
  deploymentStartDate: Date;
  deploymentEndDate: Date | null;
  /** Every vehicle segment in the replacement chain, in any order. */
  segments: DeploymentSegmentInput[];
  rate: DedicatedMonthlyRateTerms;
  /** Aggregated from approved duties under this deployment within the period. */
  actualHours: number;
  nightHaltCount: number;
  outstationBattaDays: number;
  /** Negative or positive adjustment from the reconciliation dispute workflow (e.g. vendor-agreed deduction). */
  reconciliationAdjustment: number;
}

export interface DedicatedMonthlySettlementResult {
  daysInPeriod: number;
  activeDays: number;
  proratedFixedAmount: number;
  totalActualKm: number;
  extraKm: number;
  extraKmCharge: number;
  overtimeHours: number;
  overtimeCharge: number;
  nightHaltCharge: number;
  battaCharge: number;
  reconciliationAdjustment: number;
  /** Sum of all charges before tax — the amount that flows into the invoice's taxable value. */
  taxableValue: number;
  /** Per-component breakdown for the reconciliation-statement UI. */
  lineItems: Array<{ description: string; amount: number }>;
}

export function computeDedicatedMonthlySettlement(
  input: DedicatedMonthlySettlementInput
): DedicatedMonthlySettlementResult {
  const daysInPeriod = daysInclusive(input.periodStart, input.periodEnd);

  const deploymentActiveRange = clipToPeriod(
    input.deploymentStartDate,
    input.deploymentEndDate,
    input.periodStart,
    input.periodEnd
  );
  const activeDays = deploymentActiveRange ? daysInclusive(deploymentActiveRange.start, deploymentActiveRange.end) : 0;

  // Proration: only the deployment's own start/end clipped against the
  // period matters here. Vehicle replacement mid-deployment does NOT
  // reduce the fixed fee — the deployment continues seamlessly; it only
  // affects which vehicle's odometer contributed which km (below).
  const proratedFixedPaise = Math.round(
    (rupeesToPaise(input.rate.fixedMonthlyAmount) * activeDays) / daysInPeriod
  );

  const totalActualKm = input.segments.reduce((sum, seg) => {
    const clipped = clipToPeriod(seg.startDate, seg.endDate, input.periodStart, input.periodEnd);
    if (!clipped) return sum;
    if (seg.closingOdometer === null) {
      throw new Error('Cannot settle a period containing an open (un-closed) deployment segment');
    }
    return sum + Math.max(0, seg.closingOdometer - seg.openingOdometer);
  }, 0);

  const extraKm = positiveDiff(totalActualKm, input.rate.includedKm);
  const extraKmChargePaise = multiplyPaise(rupeesToPaise(input.rate.extraKmRate), extraKm);

  const overtimeHours = positiveDiff(input.actualHours, input.rate.includedHours);
  const overtimeChargePaise = multiplyPaise(rupeesToPaise(input.rate.extraHourRate), overtimeHours);

  const nightHaltChargePaise = multiplyPaise(rupeesToPaise(input.rate.nightHaltRate), input.nightHaltCount);
  const battaChargePaise = multiplyPaise(rupeesToPaise(input.rate.outstationBattaRate), input.outstationBattaDays);

  const adjustmentPaise = rupeesToPaise(input.reconciliationAdjustment);

  const taxableValuePaise = addPaise(
    proratedFixedPaise,
    extraKmChargePaise,
    overtimeChargePaise,
    nightHaltChargePaise,
    battaChargePaise,
    adjustmentPaise
  );

  const proratedFixedAmount = roundHalfUpToPaisa(paiseToRupeeNumber(proratedFixedPaise));
  const extraKmCharge = roundHalfUpToPaisa(paiseToRupeeNumber(extraKmChargePaise));
  const overtimeCharge = roundHalfUpToPaisa(paiseToRupeeNumber(overtimeChargePaise));
  const nightHaltCharge = roundHalfUpToPaisa(paiseToRupeeNumber(nightHaltChargePaise));
  const battaCharge = roundHalfUpToPaisa(paiseToRupeeNumber(battaChargePaise));

  const lineItems: Array<{ description: string; amount: number }> = [
    {
      description:
        activeDays === daysInPeriod
          ? 'Fixed monthly charge'
          : `Fixed monthly charge (prorated ${activeDays}/${daysInPeriod} days)`,
      amount: proratedFixedAmount,
    },
  ];
  if (extraKm > 0) lineItems.push({ description: `Extra km (${extraKm} km beyond ${input.rate.includedKm} km included)`, amount: extraKmCharge });
  if (overtimeHours > 0) lineItems.push({ description: `Overtime (${overtimeHours} hrs beyond ${input.rate.includedHours} hrs included)`, amount: overtimeCharge });
  if (input.nightHaltCount > 0) lineItems.push({ description: `Night halt (${input.nightHaltCount} nights)`, amount: nightHaltCharge });
  if (input.outstationBattaDays > 0) lineItems.push({ description: `Outstation batta (${input.outstationBattaDays} days)`, amount: battaCharge });
  if (input.reconciliationAdjustment !== 0) lineItems.push({ description: 'Reconciliation adjustment', amount: input.reconciliationAdjustment });

  return {
    daysInPeriod,
    activeDays,
    proratedFixedAmount,
    totalActualKm,
    extraKm,
    extraKmCharge,
    overtimeHours,
    overtimeCharge,
    nightHaltCharge,
    battaCharge,
    reconciliationAdjustment: input.reconciliationAdjustment,
    taxableValue: roundHalfUpToPaisa(paiseToRupeeNumber(taxableValuePaise)),
    lineItems,
  };
}
