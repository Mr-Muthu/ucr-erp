import { addPaise, multiplyPaise, positiveDiff, roundHalfUpToPaisa, rupeesToPaise, paiseToRupeeNumber } from '../lib/money.js';

/** B2C LOCAL_PACKAGE settlement: slab (e.g. 8hr/80km) + extras beyond the slab. */

export interface LocalPackageSlab {
  slabHours: number;
  slabKm: number;
  slabBaseRate: number;
  extraKmRate: number;
  extraHourRate: number;
}

export interface LocalPackageSettlementInput {
  slab: LocalPackageSlab;
  actualHours: number;
  actualKm: number;
}

export interface LocalPackageSettlementResult {
  baseCharge: number;
  extraKm: number;
  extraKmCharge: number;
  extraHours: number;
  extraHourCharge: number;
  taxableValue: number;
  lineItems: Array<{ description: string; amount: number }>;
}

export function computeLocalPackageSettlement(input: LocalPackageSettlementInput): LocalPackageSettlementResult {
  const { slab } = input;

  const extraKm = positiveDiff(input.actualKm, slab.slabKm);
  const extraHours = positiveDiff(input.actualHours, slab.slabHours);

  const baseChargePaise = rupeesToPaise(slab.slabBaseRate);
  const extraKmChargePaise = multiplyPaise(rupeesToPaise(slab.extraKmRate), extraKm);
  const extraHourChargePaise = multiplyPaise(rupeesToPaise(slab.extraHourRate), extraHours);

  const taxableValuePaise = addPaise(baseChargePaise, extraKmChargePaise, extraHourChargePaise);

  const baseCharge = roundHalfUpToPaisa(paiseToRupeeNumber(baseChargePaise));
  const extraKmCharge = roundHalfUpToPaisa(paiseToRupeeNumber(extraKmChargePaise));
  const extraHourCharge = roundHalfUpToPaisa(paiseToRupeeNumber(extraHourChargePaise));

  const lineItems = [{ description: `${slab.slabHours}hr/${slab.slabKm}km package`, amount: baseCharge }];
  if (extraKm > 0) lineItems.push({ description: `Extra km (${extraKm} km)`, amount: extraKmCharge });
  if (extraHours > 0) lineItems.push({ description: `Extra hours (${extraHours} hrs)`, amount: extraHourCharge });

  return {
    baseCharge,
    extraKm,
    extraKmCharge,
    extraHours,
    extraHourCharge,
    taxableValue: roundHalfUpToPaisa(paiseToRupeeNumber(taxableValuePaise)),
    lineItems,
  };
}
