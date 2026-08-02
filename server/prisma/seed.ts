import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

/**
 * Phase 1 seed data per the acceptance criteria: branch, categories, rate
 * cards, one vendor with BOTH engagement types, one fixed-duty customer
 * deployment, fleet, drivers (with DriverAccounts), sample customers, and
 * the Setting rows for every business number this spec left open
 * (grace period, sync retry window, discount thresholds, odometer
 * tolerance, turnaround buffer, default HSN/SAC) — configurable, never a
 * hardcoded guess baked into application code.
 */

const prisma = new PrismaClient();

async function upsertSetting(key: string, value: unknown, description: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as never, description },
    create: { key, value: value as never, description },
  });
}

async function seedSettings() {
  await upsertSetting(
    'duty.odometerTolerance.km',
    5,
    'Sanity-check tolerance (km) allowed when a driver enters an odometer reading below the last known reading before requiring an override.'
  );
  await upsertSetting(
    'vehicle.turnaroundBuffer.minutes',
    60,
    'Minimum gap enforced between two bookings/deployments for the same vehicle for cleaning/fueling turnaround.'
  );
  await upsertSetting(
    'driver.sync.retryWindow.hours',
    72,
    'How long the server accepts a driver-app outbox sync for a duty after its scheduled start before it must be manually reconciled.'
  );
  await upsertSetting(
    'document.expiry.graceDays',
    0,
    'Days of grace after a mandatory vehicle/driver document expires before the vehicle/driver is auto-blocked from assignment (0 = block immediately on expiry).'
  );
  await upsertSetting(
    'document.expiry.alertLeadDays',
    30,
    'How many days before expiry the nightly document-expiry scan raises an alert.'
  );
  await upsertSetting(
    'booking.discount.maxPercentByRole',
    { OPS: 5, MANAGER: 15, ACCOUNTS: 0, VIEWER: 0, OWNER: null },
    'Max discount % a role may apply to a B2C booking settlement without further approval. null = unlimited (OWNER only).'
  );
  await upsertSetting(
    'gst.hsnSac.default',
    { withOperator: '996601', withoutOperator: '9973', ratePct: 18 },
    'Default HSN/SAC codes and GST rate applied to new rate-card items unless overridden per item.'
  );
  await upsertSetting(
    'gst.tollsAndParkingTaxable',
    true,
    'Whether toll/parking pass-through amounts on a vendor spot-duty invoice are themselves taxable (configurable — some vendor contracts treat these as a non-taxable reimbursement).'
  );
  await upsertSetting(
    'invoice.reminderLadder.daysOverdue',
    [1, 7, 15],
    'Day offsets (D+N) after an invoice due date at which reminder notifications fire for credit vendors.'
  );
  await upsertSetting(
    'auth.lockout.maxFailedAttempts',
    5,
    'Consecutive failed login/PIN attempts (staff or driver) before the account is temporarily locked.'
  );
  await upsertSetting(
    'auth.lockout.durationMinutes',
    15,
    'How long an account stays locked after hitting the failed-attempt threshold.'
  );
  await upsertSetting(
    'outstation.defaultMinKmPerDay',
    250,
    'Default minimum-km/day floor for new OUTSTATION rate-card items (overridable per item).'
  );
}

async function main() {
  await seedSettings();

  const branch = await prisma.branch.upsert({
    where: { code: 'PUNE-HQ' },
    update: {},
    create: {
      name: 'Ulagammal Car Rental — Pune HQ',
      code: 'PUNE-HQ',
      address: 'Pune, Maharashtra',
      gstin: '27AAAAA0000A1Z5',
      stateCode: '27',
      isDefault: true,
    },
  });

  const sedan = await prisma.vehicleCategory.upsert({
    where: { code: 'SEDAN' },
    update: {},
    create: { name: 'Sedan', code: 'SEDAN', defaultSeatingCapacity: 4, description: 'Dzire/Etios class' },
  });
  const suv = await prisma.vehicleCategory.upsert({
    where: { code: 'SUV' },
    update: {},
    create: { name: 'SUV', code: 'SUV', defaultSeatingCapacity: 7, description: 'Innova class' },
  });

  const ownerPasswordHash = await argon2.hash('ChangeMe@123');
  const owner = await prisma.user.upsert({
    where: { email: 'owner@ucr.example' },
    update: {},
    create: {
      branchId: branch.id,
      name: 'UCR Owner',
      email: 'owner@ucr.example',
      passwordHash: ownerPasswordHash,
      role: 'OWNER',
    },
  });

  const opsPasswordHash = await argon2.hash('ChangeMe@123');
  await prisma.user.upsert({
    where: { email: 'ops@ucr.example' },
    update: {},
    create: {
      branchId: branch.id,
      name: 'UCR Ops',
      email: 'ops@ucr.example',
      passwordHash: opsPasswordHash,
      role: 'OPS',
    },
  });

  // ── Fleet ──
  const vehicle1 = await prisma.vehicle.upsert({
    where: { registrationNumber: 'MH12AB1234' },
    update: {},
    create: {
      branchId: branch.id,
      categoryId: sedan.id,
      registrationNumber: 'MH12AB1234',
      make: 'Maruti Suzuki',
      model: 'Dzire',
      year: 2023,
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      seats: 4,
      currentOdometer: 12_500,
    },
  });
  const vehicle2 = await prisma.vehicle.upsert({
    where: { registrationNumber: 'MH12CD5678' },
    update: {},
    create: {
      branchId: branch.id,
      categoryId: suv.id,
      registrationNumber: 'MH12CD5678',
      make: 'Toyota',
      model: 'Innova Crysta',
      year: 2022,
      fuelType: 'DIESEL',
      transmission: 'MANUAL',
      seats: 7,
      currentOdometer: 34_200,
    },
  });

  // ── Drivers (with DriverAccounts for the mobile app) ──
  const driver1 = await prisma.driver.upsert({
    where: { licenseNumber: 'MH12-2015-0012345' },
    update: {},
    create: {
      branchId: branch.id,
      name: 'Ramesh Kumar',
      phone: '9800000001',
      licenseNumber: 'MH12-2015-0012345',
      licenseClass: 'LMV',
      licenseExpiry: new Date('2028-06-30'),
      payoutModel: 'MONTHLY_SALARY',
      monthlySalary: 18_000,
    },
  });
  const driverPin1 = await argon2.hash('1234');
  await prisma.driverAccount.upsert({
    where: { driverId: driver1.id },
    update: {},
    create: { driverId: driver1.id, phone: driver1.phone, pinHash: driverPin1 },
  });

  const driver2 = await prisma.driver.upsert({
    where: { licenseNumber: 'MH12-2017-0054321' },
    update: {},
    create: {
      branchId: branch.id,
      name: 'Suresh Patil',
      phone: '9800000002',
      licenseNumber: 'MH12-2017-0054321',
      licenseClass: 'LMV',
      licenseExpiry: new Date('2027-03-31'),
      payoutModel: 'MONTHLY_SALARY',
      monthlySalary: 18_000,
    },
  });
  const driverPin2 = await argon2.hash('1234');
  await prisma.driverAccount.upsert({
    where: { driverId: driver2.id },
    update: {},
    create: { driverId: driver2.id, phone: driver2.phone, pinHash: driverPin2 },
  });

  // ── Vendor with BOTH engagement types ──
  const vendor = await prisma.vendor.create({
    data: {
      branchId: branch.id,
      companyName: 'Skyline Corporate Travel Pvt Ltd',
      gstin: '27BBBBB1111B1Z5',
      billingAddress: 'Hinjewadi Phase 2, Pune, Maharashtra',
      placeOfSupplyStateCode: '27',
      contactName: 'Priya Sharma',
      contactPhone: '9811111111',
      contactEmail: 'priya@skylinecorp.example',
      billingCycleDay: 1,
      creditTermDays: 15,
    },
  });

  const dedicatedRateCard = await prisma.vendorRateCard.create({
    data: { vendorId: vendor.id, engagementType: 'DEDICATED_MONTHLY', effectiveFrom: new Date('2026-01-01') },
  });
  await prisma.vendorRateCardItem.create({
    data: {
      rateCardId: dedicatedRateCard.id,
      categoryId: sedan.id,
      fixedMonthlyAmount: 60_000,
      includedKm: 3_000,
      includedHours: 300,
      extraKmRate: 12,
      extraHourRate: 50,
      driverOvertimeHourlyRate: 60,
      nightHaltRate: 300,
      outstationBattaRate: 400,
      fuelResponsibility: 'UCR_FUEL',
      hsnSac: '996601',
    },
  });

  const spotRateCard = await prisma.vendorRateCard.create({
    data: { vendorId: vendor.id, engagementType: 'SPOT_DUTY', effectiveFrom: new Date('2026-01-01') },
  });
  await prisma.vendorRateCardItem.create({
    data: {
      rateCardId: spotRateCard.id,
      categoryId: sedan.id,
      slabLabel: '8/80',
      slabHours: 8,
      slabKm: 80,
      slabBaseRate: 2_200,
      extraKmRateSpot: 14,
      extraHourRateSpot: 120,
      hsnSac: '996601',
    },
  });
  await prisma.vendorRateCardItem.create({
    data: {
      rateCardId: spotRateCard.id,
      categoryId: sedan.id,
      slabLabel: 'AIRPORT',
      slabBaseRate: 900,
      hsnSac: '996601',
    },
  });

  // ── Retail (B2C) rate cards ──
  const localRateCard = await prisma.rateCard.create({
    data: { branchId: branch.id, type: 'LOCAL_PACKAGE', effectiveFrom: new Date('2026-01-01') },
  });
  await prisma.rateCardItem.createMany({
    data: [
      { rateCardId: localRateCard.id, categoryId: sedan.id, slabLabel: '4/40', slabHours: 4, slabKm: 40, slabBaseRate: 1_200, extraKmRate: 15, extraHourRate: 100 },
      { rateCardId: localRateCard.id, categoryId: sedan.id, slabLabel: '8/80', slabHours: 8, slabKm: 80, slabBaseRate: 2_200, extraKmRate: 15, extraHourRate: 100 },
      { rateCardId: localRateCard.id, categoryId: sedan.id, slabLabel: '12/120', slabHours: 12, slabKm: 120, slabBaseRate: 3_000, extraKmRate: 15, extraHourRate: 100 },
    ],
  });

  const outstationRateCard = await prisma.rateCard.create({
    data: { branchId: branch.id, type: 'OUTSTATION', effectiveFrom: new Date('2026-01-01') },
  });
  await prisma.rateCardItem.create({
    data: {
      rateCardId: outstationRateCard.id,
      categoryId: sedan.id,
      perKmRate: 13,
      minKmPerDay: 250,
      driverBattaPerDay: 400,
      nightHaltRate: 300,
    },
  });

  const airportRateCard = await prisma.rateCard.create({
    data: { branchId: branch.id, type: 'AIRPORT_TRANSFER', effectiveFrom: new Date('2026-01-01') },
  });
  await prisma.rateCardItem.create({
    data: { rateCardId: airportRateCard.id, categoryId: sedan.id, routeLabel: 'PNQ Airport <-> City', flatRate: 900 },
  });

  const fixedDutyRateCard = await prisma.rateCard.create({
    data: { branchId: branch.id, type: 'FIXED_DUTY_MONTHLY', effectiveFrom: new Date('2026-01-01') },
  });
  const fixedDutyRateItem = await prisma.rateCardItem.create({
    data: {
      rateCardId: fixedDutyRateCard.id,
      categoryId: sedan.id,
      fixedMonthlyAmount: 45_000,
      includedKm: 2_000,
      includedHours: 220,
      fixedExtraKmRate: 14,
      fixedExtraHourRate: 55,
    },
  });

  // ── Sample B2C customers ──
  const customer1 = await prisma.customer.create({
    data: { branchId: branch.id, name: 'Ananya Deshmukh', phone: '9822222222', email: 'ananya@example.com', type: 'INDIVIDUAL' },
  });
  const fixedDutyCustomer = await prisma.customer.create({
    data: {
      branchId: branch.id,
      name: 'Meridian Consulting LLP',
      phone: '9833333333',
      email: 'accounts@meridian.example',
      type: 'BUSINESS',
      gstin: '27CCCCC2222C1Z5',
    },
  });

  // ── One fixed-duty customer deployment (uses the SAME deployment
  // mechanism as a vendor dedicated deployment, per spec) ──
  const fixedDutyDeployment = await prisma.vehicleDeployment.create({
    data: {
      branchId: branch.id,
      counterpartyType: 'CUSTOMER',
      customerId: fixedDutyCustomer.id,
      customerRateCardItemId: fixedDutyRateItem.id,
      rateSnapshotJson: {
        fixedMonthlyAmount: 45_000,
        includedKm: 2_000,
        includedHours: 220,
        extraKmRate: 14,
        extraHourRate: 55,
      },
      defaultDriverId: driver2.id,
      startDate: new Date('2026-07-01'),
      openingOdometer: vehicle2.currentOdometer,
    },
  });
  await prisma.deploymentVehicleSegment.create({
    data: {
      deploymentId: fixedDutyDeployment.id,
      vehicleId: vehicle2.id,
      startDate: new Date('2026-07-01'),
      openingOdometer: vehicle2.currentOdometer,
    },
  });
  await prisma.vehicle.update({ where: { id: vehicle2.id }, data: { status: 'DEPLOYED' } });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    branch: branch.code,
    owner: owner.email,
    vehicles: [vehicle1.registrationNumber, vehicle2.registrationNumber],
    drivers: [driver1.name, driver2.name],
    vendor: vendor.companyName,
    customers: [customer1.name, fixedDutyCustomer.name],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
