import { addPaise, roundHalfUpToPaisa, rupeesToPaise, paiseToRupeeNumber } from '../lib/money.js';

/** B2C AIRPORT_TRANSFER settlement: flat rate per category/route + configured extras. */

export interface AirportTransferSettlementInput {
  flatRate: number;
  /** e.g. waiting charges, toll pass-through — kept generic per spec's "configured extras". */
  extraCharges: Array<{ description: string; amount: number }>;
}

export interface AirportTransferSettlementResult {
  flatRate: number;
  extraChargesTotal: number;
  taxableValue: number;
  lineItems: Array<{ description: string; amount: number }>;
}

export function computeAirportTransferSettlement(
  input: AirportTransferSettlementInput
): AirportTransferSettlementResult {
  const flatRatePaise = rupeesToPaise(input.flatRate);
  const extraPaiseValues = input.extraCharges.map((e) => rupeesToPaise(e.amount));
  const extraTotalPaise = addPaise(...extraPaiseValues);
  const taxableValuePaise = addPaise(flatRatePaise, extraTotalPaise);

  return {
    flatRate: roundHalfUpToPaisa(paiseToRupeeNumber(flatRatePaise)),
    extraChargesTotal: roundHalfUpToPaisa(paiseToRupeeNumber(extraTotalPaise)),
    taxableValue: roundHalfUpToPaisa(paiseToRupeeNumber(taxableValuePaise)),
    lineItems: [{ description: 'Airport transfer (flat)', amount: input.flatRate }, ...input.extraCharges],
  };
}
