import { addPaise, multiplyPaise, positiveDiff, roundHalfUpToPaisa, rupeesToPaise, paiseToRupeeNumber } from '../lib/money.js';

/**
 * Vendor SPOT_DUTY settlement: a single duty billed against a slab
 * (e.g. 4hr/40km) plus extras beyond the slab, plus toll/parking pass
 * through. Also covers the flat-rate AIRPORT slab row (slabKm/slabHours
 * both 0, extras irrelevant, base = flat rate).
 */

export interface VendorSpotDutySlab {
  slabHours: number;
  slabKm: number;
  slabBaseRate: number;
  extraKmRateSpot: number;
  extraHourRateSpot: number;
}

export interface VendorSpotDutySettlementInput {
  slab: VendorSpotDutySlab;
  actualHours: number;
  actualKm: number;
  tollsAndParkingAmount: number;
  /** Whether tolls/parking pass-through is itself taxable — configurable per Setting, defaults true. */
  tollsAndParkingTaxable: boolean;
}

export interface VendorSpotDutySettlementResult {
  baseCharge: number;
  extraKm: number;
  extraKmCharge: number;
  extraHours: number;
  extraHourCharge: number;
  tollsAndParkingAmount: number;
  taxableValue: number;
  nonTaxablePassThrough: number;
  lineItems: Array<{ description: string; amount: number; taxable: boolean }>;
}

export function computeVendorSpotDutySettlement(
  input: VendorSpotDutySettlementInput
): VendorSpotDutySettlementResult {
  const { slab } = input;

  const extraKm = positiveDiff(input.actualKm, slab.slabKm);
  const extraHours = positiveDiff(input.actualHours, slab.slabHours);

  const baseChargePaise = rupeesToPaise(slab.slabBaseRate);
  const extraKmChargePaise = multiplyPaise(rupeesToPaise(slab.extraKmRateSpot), extraKm);
  const extraHourChargePaise = multiplyPaise(rupeesToPaise(slab.extraHourRateSpot), extraHours);
  const tollsPaise = rupeesToPaise(input.tollsAndParkingAmount);

  const taxableCharges = addPaise(baseChargePaise, extraKmChargePaise, extraHourChargePaise);
  const taxableValuePaise = input.tollsAndParkingTaxable ? addPaise(taxableCharges, tollsPaise) : taxableCharges;
  const nonTaxablePassThroughPaise = input.tollsAndParkingTaxable ? 0 : tollsPaise;

  const baseCharge = roundHalfUpToPaisa(paiseToRupeeNumber(baseChargePaise));
  const extraKmCharge = roundHalfUpToPaisa(paiseToRupeeNumber(extraKmChargePaise));
  const extraHourCharge = roundHalfUpToPaisa(paiseToRupeeNumber(extraHourChargePaise));

  const lineItems: Array<{ description: string; amount: number; taxable: boolean }> = [
    { description: `Slab base (${slab.slabHours}hr/${slab.slabKm}km)`, amount: baseCharge, taxable: true },
  ];
  if (extraKm > 0) lineItems.push({ description: `Extra km (${extraKm} km)`, amount: extraKmCharge, taxable: true });
  if (extraHours > 0) lineItems.push({ description: `Extra hours (${extraHours} hrs)`, amount: extraHourCharge, taxable: true });
  if (input.tollsAndParkingAmount > 0) {
    lineItems.push({
      description: 'Toll & parking pass-through',
      amount: input.tollsAndParkingAmount,
      taxable: input.tollsAndParkingTaxable,
    });
  }

  return {
    baseCharge,
    extraKm,
    extraKmCharge,
    extraHours,
    extraHourCharge,
    tollsAndParkingAmount: input.tollsAndParkingAmount,
    taxableValue: roundHalfUpToPaisa(paiseToRupeeNumber(taxableValuePaise)),
    nonTaxablePassThrough: roundHalfUpToPaisa(paiseToRupeeNumber(nonTaxablePassThroughPaise)),
    lineItems,
  };
}
