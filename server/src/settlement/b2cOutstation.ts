import { addPaise, multiplyPaise, roundHalfUpToPaisa, rupeesToPaise, paiseToRupeeNumber } from '../lib/money.js';

/**
 * B2C OUTSTATION settlement: billable km is max(actual km, days x
 * min-km/day floor) — the floor exists because outstation trips are priced
 * to cover the vehicle's return leg even on short-actual-km days.
 */

export interface OutstationRate {
  perKmRate: number;
  minKmPerDay: number;
  driverBattaPerDay: number;
  nightHaltRate: number;
}

export interface OutstationSettlementInput {
  rate: OutstationRate;
  days: number;
  actualKm: number;
  nightHaltCount: number;
  tollsAndParkingAmount: number;
}

export interface OutstationSettlementResult {
  billableKm: number;
  kmFloorApplied: boolean;
  kmCharge: number;
  battaCharge: number;
  nightHaltCharge: number;
  tollsAndParkingAmount: number;
  taxableValue: number;
  lineItems: Array<{ description: string; amount: number }>;
}

export function computeOutstationSettlement(input: OutstationSettlementInput): OutstationSettlementResult {
  const { rate } = input;
  const kmFloor = input.days * rate.minKmPerDay;
  const billableKm = Math.max(input.actualKm, kmFloor);
  const kmFloorApplied = billableKm > input.actualKm;

  const kmChargePaise = multiplyPaise(rupeesToPaise(rate.perKmRate), billableKm);
  const battaChargePaise = multiplyPaise(rupeesToPaise(rate.driverBattaPerDay), input.days);
  const nightHaltChargePaise = multiplyPaise(rupeesToPaise(rate.nightHaltRate), input.nightHaltCount);
  const tollsPaise = rupeesToPaise(input.tollsAndParkingAmount);

  const taxableValuePaise = addPaise(kmChargePaise, battaChargePaise, nightHaltChargePaise, tollsPaise);

  const kmCharge = roundHalfUpToPaisa(paiseToRupeeNumber(kmChargePaise));
  const battaCharge = roundHalfUpToPaisa(paiseToRupeeNumber(battaChargePaise));
  const nightHaltCharge = roundHalfUpToPaisa(paiseToRupeeNumber(nightHaltChargePaise));

  const lineItems = [
    {
      description: kmFloorApplied
        ? `Km charge (${billableKm} km @ ${rate.minKmPerDay} km/day floor, actual ${input.actualKm} km)`
        : `Km charge (${billableKm} km actual)`,
      amount: kmCharge,
    },
    { description: `Driver batta (${input.days} days)`, amount: battaCharge },
  ];
  if (input.nightHaltCount > 0) lineItems.push({ description: `Night halt (${input.nightHaltCount} nights)`, amount: nightHaltCharge });
  if (input.tollsAndParkingAmount > 0) lineItems.push({ description: 'Toll & parking pass-through', amount: input.tollsAndParkingAmount });

  return {
    billableKm,
    kmFloorApplied,
    kmCharge,
    battaCharge,
    nightHaltCharge,
    tollsAndParkingAmount: input.tollsAndParkingAmount,
    taxableValue: roundHalfUpToPaisa(paiseToRupeeNumber(taxableValuePaise)),
    lineItems,
  };
}
