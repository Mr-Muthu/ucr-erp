import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/apiError.js';
import { monthPeriodBounds } from '../../lib/financialYear.js';
import { nextSequenceNumber, formatInvoiceNumber } from '../../lib/invoiceNumbering.js';
import { computeGst } from '../../lib/money.js';
import { computeVendorSpotDutySettlement } from '../../settlement/vendorSpotDuty.js';
import { computeDedicatedMonthlySettlement, type DedicatedMonthlyRateTerms } from '../../settlement/dedicatedMonthly.js';
import { env } from '../../config/env.js';
import { getSetting } from '../../lib/settings.js';

type CounterpartyRef = { counterpartyType: 'VENDOR'; vendorId: string } | { counterpartyType: 'CUSTOMER'; customerId: string };

function dutyHours(duty: { deviceStartAt: Date | null; deviceEndAt: Date | null; serverStartAt: Date | null; serverEndAt: Date | null }): number {
  const start = duty.deviceStartAt ?? duty.serverStartAt;
  const end = duty.deviceEndAt ?? duty.serverEndAt;
  if (!start || !end) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

async function tollsForDuty(tx: Prisma.TransactionClient, dutyId: string): Promise<number> {
  const entries = await tx.dutyExpenseEntry.findMany({ where: { dutyId, type: { in: ['TOLL', 'PARKING'] } } });
  return entries.reduce((sum, e) => sum + Number(e.amount), 0);
}

/**
 * (Re)generates the draft line items for a counterparty's month — safe to
 * call repeatedly before finalize (each call replaces the previous draft
 * lines with a fresh computation from current duty data). Rejects once the
 * reconciliation has moved past DRAFT/STATEMENT_SENT/DISPUTED.
 */
export async function prepareReconciliation(ref: CounterpartyRef & { branchId: string; period: string }) {
  const { periodStart, periodEnd } = monthPeriodBounds(ref.period);

  const existing = await prisma.monthlyReconciliation.findFirst({
    where: {
      counterpartyType: ref.counterpartyType,
      vendorId: ref.counterpartyType === 'VENDOR' ? ref.vendorId : null,
      customerId: ref.counterpartyType === 'CUSTOMER' ? ref.customerId : null,
      periodStart,
      periodEnd,
    },
  });
  if (existing && ['FINALIZED', 'INVOICED'].includes(existing.status)) {
    throw ApiError.conflict(`This reconciliation is already ${existing.status.toLowerCase()} and cannot be re-prepared`);
  }

  const reconciliation =
    existing ??
    (await prisma.monthlyReconciliation.create({
      data: {
        branchId: ref.branchId,
        counterpartyType: ref.counterpartyType,
        vendorId: ref.counterpartyType === 'VENDOR' ? ref.vendorId : undefined,
        customerId: ref.counterpartyType === 'CUSTOMER' ? ref.customerId : undefined,
        periodStart,
        periodEnd,
      },
    }));

  await prisma.reconciliationLine.deleteMany({ where: { reconciliationId: reconciliation.id } });

  const lines: Prisma.ReconciliationLineCreateManyInput[] = [];

  // ── SPOT_DUTY lines (vendor only — fixed-duty customers only ever use the dedicated-monthly path) ──
  if (ref.counterpartyType === 'VENDOR') {
    const spotDuties = await prisma.duty.findMany({
      where: { vendorId: ref.vendorId, deploymentId: null, status: 'APPROVED', scheduledStart: { gte: periodStart, lte: periodEnd } },
    });
    const tollsTaxable = await getSetting(prisma, 'gst.tollsAndParkingTaxable', true);
    for (const duty of spotDuties) {
      const snapshot = (duty.rateSnapshotJson ?? {}) as Record<string, number>;
      const tolls = await tollsForDuty(prisma, duty.id);
      const settlement = computeVendorSpotDutySettlement({
        slab: {
          slabHours: snapshot.slabHours ?? 0,
          slabKm: snapshot.slabKm ?? 0,
          slabBaseRate: snapshot.slabBaseRate ?? 0,
          extraKmRateSpot: snapshot.extraKmRateSpot ?? 0,
          extraHourRateSpot: snapshot.extraHourRateSpot ?? 0,
        },
        actualHours: dutyHours(duty),
        actualKm: duty.openingOdometer !== null && duty.closingOdometer !== null ? duty.closingOdometer - duty.openingOdometer : 0,
        tollsAndParkingAmount: tolls,
        tollsAndParkingTaxable: tollsTaxable,
      });
      lines.push({
        reconciliationId: reconciliation.id,
        dutyId: duty.id,
        description: `Spot duty ${duty.id} (${snapshot.slabLabel ?? 'slab'})`,
        computedAmount: settlement.taxableValue,
        finalAmount: settlement.taxableValue,
      });
    }
  }

  // ── DEDICATED_MONTHLY lines (one per deployment active in this period) ──
  const deployments = await prisma.vehicleDeployment.findMany({
    where: {
      branchId: ref.branchId,
      counterpartyType: ref.counterpartyType,
      vendorId: ref.counterpartyType === 'VENDOR' ? ref.vendorId : undefined,
      customerId: ref.counterpartyType === 'CUSTOMER' ? ref.customerId : undefined,
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
    },
    include: { vehicleSegments: true },
  });

  for (const deployment of deployments) {
    const duties = await prisma.duty.findMany({
      where: { deploymentId: deployment.id, status: 'APPROVED', scheduledStart: { gte: periodStart, lte: periodEnd } },
    });
    const actualHours = duties.reduce((sum, d) => sum + dutyHours(d), 0);
    const nightHaltCount = await prisma.dutyNightHalt.count({ where: { duty: { deploymentId: deployment.id }, haltDate: { gte: periodStart, lte: periodEnd } } });

    const rate = (deployment.rateSnapshotJson ?? {}) as Partial<DedicatedMonthlyRateTerms>;
    const settlement = computeDedicatedMonthlySettlement({
      periodStart,
      periodEnd,
      deploymentStartDate: deployment.startDate,
      deploymentEndDate: deployment.endDate,
      segments: deployment.vehicleSegments.map((s) => ({
        startDate: s.startDate,
        endDate: s.endDate,
        openingOdometer: s.openingOdometer,
        closingOdometer: s.closingOdometer ?? s.openingOdometer, // ongoing segment: no km counted yet for the open tail
      })),
      rate: {
        fixedMonthlyAmount: rate.fixedMonthlyAmount ?? 0,
        includedKm: rate.includedKm ?? 0,
        includedHours: rate.includedHours ?? 0,
        extraKmRate: rate.extraKmRate ?? 0,
        extraHourRate: rate.extraHourRate ?? 0,
        nightHaltRate: rate.nightHaltRate ?? 0,
        outstationBattaRate: rate.outstationBattaRate ?? 0,
      },
      actualHours,
      nightHaltCount,
      // Outstation-day attribution for a dedicated deployment isn't
      // separately modelled in Phase 2 (no per-duty "this was an outstation
      // leg" flag yet) — left at 0 here; a documented simplification.
      outstationBattaDays: 0,
      reconciliationAdjustment: 0,
    });

    lines.push({
      reconciliationId: reconciliation.id,
      deploymentId: deployment.id,
      description: `Dedicated deployment ${deployment.id} — ${settlement.lineItems.map((l) => l.description).join('; ')}`,
      computedAmount: settlement.taxableValue,
      finalAmount: settlement.taxableValue,
    });
  }

  if (lines.length > 0) await prisma.reconciliationLine.createMany({ data: lines });

  return prisma.monthlyReconciliation.findUniqueOrThrow({ where: { id: reconciliation.id }, include: { lines: true } });
}

export async function generateStatement(reconciliationId: string) {
  const reconciliation = await prisma.monthlyReconciliation.findUnique({ where: { id: reconciliationId }, include: { lines: true } });
  if (!reconciliation) throw ApiError.notFound('Reconciliation not found');
  if (['FINALIZED', 'INVOICED'].includes(reconciliation.status)) throw ApiError.conflict(`Already ${reconciliation.status.toLowerCase()}`);
  return prisma.monthlyReconciliation.update({
    where: { id: reconciliationId },
    data: { status: 'STATEMENT_SENT', statementGeneratedAt: new Date() },
    include: { lines: true },
  });
}

export async function adjustLine(
  lineId: string,
  input: { claimedAmount?: number; disputeStatus?: string; adjustmentAmount?: number; adjustmentReason?: string }
) {
  const line = await prisma.reconciliationLine.findUnique({ where: { id: lineId } });
  if (!line) throw ApiError.notFound('Reconciliation line not found');
  const adjustmentAmount = input.adjustmentAmount ?? Number(line.adjustmentAmount);
  const finalAmount = Number(line.computedAmount) + adjustmentAmount;
  return prisma.reconciliationLine.update({
    where: { id: lineId },
    data: {
      claimedAmount: input.claimedAmount,
      disputeStatus: (input.disputeStatus as never) ?? line.disputeStatus,
      adjustmentAmount,
      adjustmentReason: input.adjustmentReason ?? line.adjustmentReason,
      finalAmount,
    },
  });
}

/**
 * Idempotent: if the reconciliation already has an invoice, that same
 * invoice is returned without touching anything else — calling finalize
 * twice never creates a second invoice or re-bills duties.
 */
export async function finalizeReconciliation(reconciliationId: string, staffUserId: string) {
  const reconciliation = await prisma.monthlyReconciliation.findUnique({
    where: { id: reconciliationId },
    include: { lines: true, vendor: true, customer: true },
  });
  if (!reconciliation) throw ApiError.notFound('Reconciliation not found');

  if (reconciliation.invoiceId) {
    return prisma.invoice.findUniqueOrThrow({ where: { id: reconciliation.invoiceId }, include: { lineItems: true } });
  }
  if (reconciliation.lines.length === 0) throw ApiError.conflict('Cannot finalize a reconciliation with no lines — run prepare first');

  return prisma.$transaction(async (tx) => {
    const subtotal = reconciliation.lines.reduce((sum, l) => sum + Number(l.finalAmount), 0);

    const supplierStateCode = env.COMPANY_STATE_CODE;
    const placeOfSupplyStateCode =
      reconciliation.counterpartyType === 'VENDOR'
        ? reconciliation.vendor!.placeOfSupplyStateCode
        : reconciliation.customer?.gstin?.slice(0, 2) || supplierStateCode;

    const hsnDefault = await getSetting(tx as unknown as PrismaClient, 'gst.hsnSac.default', { withOperator: '996601', withoutOperator: '9973', ratePct: 18 });
    const gst = computeGst({ taxableValue: subtotal, gstRatePct: hsnDefault.ratePct, supplierStateCode, placeOfSupplyStateCode });

    const now = new Date();
    const { financialYear, sequenceNumber } = await nextSequenceNumber(tx, 'INVOICE', now);
    const invoiceNumber = formatInvoiceNumber(financialYear, sequenceNumber);
    const totalAmount = Math.round(subtotal + gst.totalTax);
    const roundingAdjustment = Number((totalAmount - (subtotal + gst.totalTax)).toFixed(2));

    const invoice = await tx.invoice.create({
      data: {
        branchId: reconciliation.branchId,
        invoiceNumber,
        financialYear,
        sequenceNumber,
        type: reconciliation.counterpartyType === 'VENDOR' ? 'VENDOR_MONTHLY' : 'CUSTOMER_FIXED_DUTY_MONTHLY',
        vendorId: reconciliation.vendorId,
        customerId: reconciliation.customerId,
        supplierGstin: env.COMPANY_GSTIN || 'UNCONFIGURED',
        recipientGstin: reconciliation.vendor?.gstin ?? reconciliation.customer?.gstin,
        placeOfSupplyStateCode,
        taxType: gst.taxType,
        subtotal,
        taxableValue: subtotal,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        roundingAdjustment,
        totalAmount,
        status: 'ISSUED',
        lineItems: {
          create: reconciliation.lines.map((line, idx) => ({
            description: line.description,
            hsnSac: hsnDefault.withOperator,
            quantity: 1,
            unitRate: Number(line.finalAmount),
            taxableValue: Number(line.finalAmount),
            gstRatePct: hsnDefault.ratePct,
            lineTotal: Number(line.finalAmount),
            sortOrder: idx,
          })),
        },
      },
      include: { lineItems: true },
    });

    await tx.monthlyReconciliation.update({
      where: { id: reconciliation.id },
      data: { status: 'INVOICED', invoiceId: invoice.id, finalizedAt: now, finalizedById: staffUserId },
    });

    // Lock every duty this invoice covers to BILLED — direct spot-duty
    // lines reference a dutyId; dedicated-monthly lines reference a
    // deploymentId, so re-derive the covered duties the same way prepare did.
    const directDutyIds = reconciliation.lines.filter((l) => l.dutyId).map((l) => l.dutyId as string);
    if (directDutyIds.length > 0) {
      await tx.duty.updateMany({ where: { id: { in: directDutyIds }, status: 'APPROVED' }, data: { status: 'BILLED' } });
    }
    const deploymentIds = reconciliation.lines.filter((l) => l.deploymentId).map((l) => l.deploymentId as string);
    if (deploymentIds.length > 0) {
      await tx.duty.updateMany({
        where: {
          deploymentId: { in: deploymentIds },
          status: 'APPROVED',
          scheduledStart: { gte: reconciliation.periodStart, lte: reconciliation.periodEnd },
        },
        data: { status: 'BILLED' },
      });
    }

    return invoice;
  });
}
