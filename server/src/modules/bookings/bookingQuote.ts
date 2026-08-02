import type { RateCardItem } from '@prisma/client';
import { computeLocalPackageSettlement } from '../../settlement/b2cLocalPackage.js';
import { computeOutstationSettlement } from '../../settlement/b2cOutstation.js';
import { computeAirportTransferSettlement } from '../../settlement/b2cAirportTransfer.js';

/**
 * Pre-trip estimate shown in the booking wizard — no actual km/hours exist
 * yet, so this is the base charge only (no overage). The real settlement,
 * run on duty completion with actual figures, reuses the same Phase 1
 * calculators (see bookings.routes.ts `/settlement/preview|confirm`).
 */
export function computeInitialBookingQuote(type: string, item: RateCardItem, outstationDays?: number): number {
  if (type === 'LOCAL_PACKAGE') {
    return computeLocalPackageSettlement({
      slab: {
        slabHours: item.slabHours ?? 0,
        slabKm: item.slabKm ?? 0,
        slabBaseRate: Number(item.slabBaseRate ?? 0),
        extraKmRate: Number(item.extraKmRate ?? 0),
        extraHourRate: Number(item.extraHourRate ?? 0),
      },
      actualHours: item.slabHours ?? 0,
      actualKm: item.slabKm ?? 0,
    }).taxableValue;
  }

  if (type === 'OUTSTATION') {
    return computeOutstationSettlement({
      rate: {
        perKmRate: Number(item.perKmRate ?? 0),
        minKmPerDay: item.minKmPerDay ?? 0,
        driverBattaPerDay: Number(item.driverBattaPerDay ?? 0),
        nightHaltRate: Number(item.nightHaltRate ?? 0),
      },
      days: outstationDays ?? 1,
      actualKm: 0,
      nightHaltCount: 0,
      tollsAndParkingAmount: 0,
    }).taxableValue;
  }

  // AIRPORT_TRANSFER
  return computeAirportTransferSettlement({ flatRate: Number(item.flatRate ?? 0), extraCharges: [] }).taxableValue;
}
