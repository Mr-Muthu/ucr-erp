import type { Duty, DutyExpenseEntry, DutyNightHalt } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/apiError.js';
import { getSetting } from '../../lib/settings.js';
import { assertDutyTransition, type DutyStatus } from '../../domain/dutyStatus.js';

/**
 * Shared business logic behind both the direct driver endpoints
 * (POST /driver/v1/duties/:id/accept|start|complete...) and the offline
 * batch sync endpoint (POST /driver/v1/sync) — one implementation, two
 * entry points, so "accept via sync" and "accept via direct call" can never
 * drift apart.
 */

async function loadOwnDuty(driverId: string, dutyId: string): Promise<Duty> {
  const duty = await prisma.duty.findUnique({ where: { id: dutyId } });
  if (!duty) throw ApiError.notFound('Duty not found');
  if (duty.driverId !== driverId) throw ApiError.forbidden('This duty does not belong to you');
  return duty;
}

export async function acceptDuty(driverId: string, dutyId: string): Promise<Duty> {
  const duty = await loadOwnDuty(driverId, dutyId);
  const nextStatus = assertDutyTransition(duty.status as DutyStatus, 'accept', 'DRIVER') as DutyStatus;
  return prisma.duty.update({ where: { id: duty.id }, data: { status: nextStatus } });
}

export async function declineDuty(driverId: string, dutyId: string, reason: string): Promise<Duty> {
  const duty = await loadOwnDuty(driverId, dutyId);
  const nextStatus = assertDutyTransition(duty.status as DutyStatus, 'decline', 'DRIVER') as DutyStatus;
  return prisma.duty.update({ where: { id: duty.id }, data: { status: nextStatus, declineReason: reason } });
}

export interface StartDutyInput {
  deviceStartAt: Date;
  openingOdometer: number;
  openingOdometerPhotoKey?: string;
  startGpsLat?: number;
  startGpsLng?: number;
}

export async function startDuty(driverId: string, dutyId: string, input: StartDutyInput): Promise<Duty> {
  const duty = await loadOwnDuty(driverId, dutyId);
  const nextStatus = assertDutyTransition(duty.status as DutyStatus, 'start', 'DRIVER') as DutyStatus;

  const toleranceKm = await getSetting(prisma, 'duty.odometerTolerance.km', 5);
  const vehicle = await prisma.vehicle.findUnique({ where: { id: duty.vehicleId } });
  if (vehicle && input.openingOdometer < vehicle.currentOdometer - toleranceKm) {
    throw ApiError.badRequest(
      `Opening odometer (${input.openingOdometer}) is well below the vehicle's last known reading (${vehicle.currentOdometer}). Ask ops to confirm before overriding.`,
      'openingOdometer'
    );
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.duty.update({
      where: { id: duty.id },
      data: {
        status: nextStatus,
        deviceStartAt: input.deviceStartAt,
        serverStartAt: new Date(),
        openingOdometer: input.openingOdometer,
        openingOdometerPhotoKey: input.openingOdometerPhotoKey,
        startGpsLat: input.startGpsLat,
        startGpsLng: input.startGpsLng,
      },
    });
    await tx.odometerLog.create({
      data: {
        vehicleId: duty.vehicleId,
        reading: input.openingOdometer,
        source: 'DUTY_START',
        dutyId: duty.id,
        photoKey: input.openingOdometerPhotoKey,
      },
    });
    return result;
  });
}

export interface CompleteDutyInput {
  deviceEndAt: Date;
  closingOdometer: number;
  closingOdometerPhotoKey?: string;
  endGpsLat?: number;
  endGpsLng?: number;
  passengerSignatureKey?: string;
  passengerName?: string;
  driverFeedbackNote?: string;
  driverFeedbackTags?: string[];
}

export async function completeDuty(driverId: string, dutyId: string, input: CompleteDutyInput): Promise<Duty> {
  const duty = await loadOwnDuty(driverId, dutyId);
  const nextStatus = assertDutyTransition(duty.status as DutyStatus, 'complete', 'DRIVER') as DutyStatus;

  if (duty.openingOdometer !== null && input.closingOdometer <= duty.openingOdometer) {
    throw ApiError.badRequest('Closing odometer must be greater than opening odometer', 'closingOdometer');
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.duty.update({
      where: { id: duty.id },
      data: {
        status: nextStatus,
        deviceEndAt: input.deviceEndAt,
        serverEndAt: new Date(),
        closingOdometer: input.closingOdometer,
        closingOdometerPhotoKey: input.closingOdometerPhotoKey,
        endGpsLat: input.endGpsLat,
        endGpsLng: input.endGpsLng,
        passengerSignatureKey: input.passengerSignatureKey,
        passengerName: input.passengerName ?? duty.passengerName,
        driverFeedbackNote: input.driverFeedbackNote,
        driverFeedbackTags: input.driverFeedbackTags ?? [],
      },
    });
    await tx.odometerLog.create({
      data: {
        vehicleId: duty.vehicleId,
        reading: input.closingOdometer,
        source: 'DUTY_END',
        dutyId: duty.id,
        photoKey: input.closingOdometerPhotoKey,
      },
    });
    await tx.vehicle.update({ where: { id: duty.vehicleId }, data: { currentOdometer: input.closingOdometer } });
    return result;
  });
}

export async function submitDuty(driverId: string, dutyId: string): Promise<Duty> {
  const duty = await loadOwnDuty(driverId, dutyId);
  const nextStatus = assertDutyTransition(duty.status as DutyStatus, 'submit', 'DRIVER') as DutyStatus;
  return prisma.duty.update({ where: { id: duty.id }, data: { status: nextStatus } });
}

export async function resubmitDuty(driverId: string, dutyId: string): Promise<Duty> {
  const duty = await loadOwnDuty(driverId, dutyId);
  const nextStatus = assertDutyTransition(duty.status as DutyStatus, 'resubmit', 'DRIVER') as DutyStatus;
  return prisma.duty.update({ where: { id: duty.id }, data: { status: nextStatus } });
}

export interface AddEntryInput {
  clientMutationId: string;
  type: 'TOLL' | 'PARKING' | 'OTHER';
  amount: number;
  receiptPhotoKey?: string;
  reimbursableToDriver?: boolean;
}

export async function addEntry(driverId: string, dutyId: string, input: AddEntryInput): Promise<DutyExpenseEntry> {
  const duty = await loadOwnDuty(driverId, dutyId);
  return prisma.dutyExpenseEntry.upsert({
    where: { clientMutationId: input.clientMutationId },
    update: {},
    create: { ...input, dutyId: duty.id },
  });
}

export interface AddNightHaltInput {
  clientMutationId: string;
  haltDate: Date;
  notes?: string;
}

export async function addNightHalt(driverId: string, dutyId: string, input: AddNightHaltInput): Promise<DutyNightHalt> {
  const duty = await loadOwnDuty(driverId, dutyId);
  return prisma.dutyNightHalt.upsert({
    where: { clientMutationId: input.clientMutationId },
    update: {},
    create: { ...input, dutyId: duty.id },
  });
}
