import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/apiError.js';
import { env } from '../../config/env.js';
import { computeGst } from '../../lib/money.js';
import { getSetting } from '../../lib/settings.js';
import { nextSequenceNumber, formatInvoiceNumber } from '../../lib/invoiceNumbering.js';
import { computeLocalPackageSettlement } from '../../settlement/b2cLocalPackage.js';
import { computeOutstationSettlement } from '../../settlement/b2cOutstation.js';
import { computeAirportTransferSettlement } from '../../settlement/b2cAirportTransfer.js';

function dutyHours(duty: { deviceStartAt: Date | null; deviceEndAt: Date | null; serverStartAt: Date | null; serverEndAt: Date | null }): number {
  const start = duty.deviceStartAt ?? duty.serverStartAt;
  const end = duty.deviceEndAt ?? duty.serverEndAt;
  if (!start || !end) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

async function computeSettlementBreakdown(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { duties: true } });
  if (!booking) throw ApiError.notFound('Booking not found');
  const duty = [...booking.duties].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!duty) throw ApiError.conflict('This booking has no duty yet — assign one first');

  const snapshot = (booking.rateSnapshotJson ?? {}) as Record<string, number>;
  const actualHours = dutyHours(duty);
  const actualKm = duty.openingOdometer !== null && duty.closingOdometer !== null ? duty.closingOdometer - duty.openingOdometer : 0;
  const tollEntries = await prisma.dutyExpenseEntry.findMany({ where: { dutyId: duty.id, type: { in: ['TOLL', 'PARKING'] } } });
  const tolls = tollEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const nightHaltCount = await prisma.dutyNightHalt.count({ where: { dutyId: duty.id } });

  let baseSettlement;
  if (booking.type === 'LOCAL_PACKAGE') {
    baseSettlement = computeLocalPackageSettlement({
      slab: {
        slabHours: snapshot.slabHours ?? 0,
        slabKm: snapshot.slabKm ?? 0,
        slabBaseRate: snapshot.slabBaseRate ?? 0,
        extraKmRate: snapshot.extraKmRate ?? 0,
        extraHourRate: snapshot.extraHourRate ?? 0,
      },
      actualHours,
      actualKm,
    });
  } else if (booking.type === 'OUTSTATION') {
    baseSettlement = computeOutstationSettlement({
      rate: {
        perKmRate: snapshot.perKmRate ?? 0,
        minKmPerDay: snapshot.minKmPerDay ?? 0,
        driverBattaPerDay: snapshot.driverBattaPerDay ?? 0,
        nightHaltRate: snapshot.nightHaltRate ?? 0,
      },
      days: booking.outstationDays ?? 1,
      actualKm,
      nightHaltCount,
      tollsAndParkingAmount: tolls,
    });
  } else {
    baseSettlement = computeAirportTransferSettlement({ flatRate: snapshot.flatRate ?? 0, extraCharges: [] });
  }

  const discount = Number(booking.discountAmount);
  const advance = Number(booking.advanceAmount);
  const taxableValue = Math.max(baseSettlement.taxableValue - discount, 0);

  const hsnDefault = await getSetting(prisma, 'gst.hsnSac.default', { withOperator: '996601', withoutOperator: '9973', ratePct: 18 });
  // Retail B2C is treated as intra-state (the customer's "place of supply"
  // for a locally-rendered chauffeur service is the branch's own state).
  const gst = computeGst({
    taxableValue,
    gstRatePct: hsnDefault.ratePct,
    supplierStateCode: env.COMPANY_STATE_CODE,
    placeOfSupplyStateCode: env.COMPANY_STATE_CODE,
  });
  const totalAmount = Math.round(taxableValue + gst.totalTax);
  const balanceDue = Math.max(totalAmount - advance, 0);

  return { booking, duty, baseSettlement, discount, advance, taxableValue, gst, totalAmount, balanceDue, hsnDefault };
}

export async function previewBookingSettlement(bookingId: string) {
  const result = await computeSettlementBreakdown(bookingId);
  return {
    lineItems: result.baseSettlement.lineItems,
    discount: result.discount,
    taxableValue: result.taxableValue,
    gst: result.gst,
    advance: result.advance,
    totalAmount: result.totalAmount,
    balanceDue: result.balanceDue,
  };
}

export async function confirmBookingSettlement(bookingId: string, staffUserId: string) {
  const existingInvoice = await prisma.invoice.findFirst({ where: { bookingId } });
  if (existingInvoice) return existingInvoice; // idempotent — same guarantee as reconciliation finalize

  const result = await computeSettlementBreakdown(bookingId);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const { financialYear, sequenceNumber } = await nextSequenceNumber(tx, 'INVOICE', now);
    const invoiceNumber = formatInvoiceNumber(financialYear, sequenceNumber);

    const invoice = await tx.invoice.create({
      data: {
        branchId: result.booking.branchId,
        invoiceNumber,
        financialYear,
        sequenceNumber,
        type: 'BOOKING',
        customerId: result.booking.customerId,
        bookingId: result.booking.id,
        supplierGstin: env.COMPANY_GSTIN || 'UNCONFIGURED',
        placeOfSupplyStateCode: env.COMPANY_STATE_CODE,
        taxType: result.gst.taxType,
        subtotal: result.baseSettlement.taxableValue,
        taxableValue: result.taxableValue,
        cgstAmount: result.gst.cgstAmount,
        sgstAmount: result.gst.sgstAmount,
        igstAmount: result.gst.igstAmount,
        totalAmount: result.totalAmount,
        amountPaid: result.advance,
        status: result.advance >= result.totalAmount ? 'PAID' : 'ISSUED',
        lineItems: {
          create: [
            ...result.baseSettlement.lineItems.map((li, idx) => ({
              description: li.description,
              hsnSac: result.hsnDefault.withOperator,
              quantity: 1,
              unitRate: li.amount,
              taxableValue: li.amount,
              gstRatePct: result.hsnDefault.ratePct,
              lineTotal: li.amount,
              sortOrder: idx,
            })),
            ...(result.discount > 0
              ? [
                  {
                    description: 'Discount',
                    hsnSac: result.hsnDefault.withOperator,
                    quantity: 1,
                    unitRate: -result.discount,
                    taxableValue: -result.discount,
                    gstRatePct: 0,
                    lineTotal: -result.discount,
                    sortOrder: 999,
                  },
                ]
              : []),
          ],
        },
      },
      include: { lineItems: true },
    });

    await tx.booking.update({ where: { id: result.booking.id }, data: { status: 'CLOSED' } });
    if (result.duty.status === 'APPROVED') {
      await tx.duty.update({ where: { id: result.duty.id }, data: { status: 'BILLED' } });
    }

    return invoice;
  });
}
