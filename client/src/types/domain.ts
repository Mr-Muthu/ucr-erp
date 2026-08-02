// Lightweight mirrors of the Prisma models this UI actually touches — not
// exhaustive, just the fields each screen reads/writes. Source of truth is
// server/prisma/schema.prisma.

export type StaffRole = 'OWNER' | 'MANAGER' | 'OPS' | 'ACCOUNTS' | 'VIEWER';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  branchId: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  stateCode: string;
}

export interface VehicleCategory {
  id: string;
  name: string;
  code: string;
  defaultSeatingCapacity: number;
}

export type VehicleStatus = 'AVAILABLE' | 'DEPLOYED' | 'ON_TRIP' | 'IN_MAINTENANCE' | 'BLOCKED' | 'RETIRED';

export interface Vehicle {
  id: string;
  branchId: string;
  categoryId: string;
  category?: VehicleCategory;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  transmission: string;
  seats: number;
  currentOdometer: number;
  status: VehicleStatus;
  documents?: VehicleDocument[];
}

export interface VehicleDocument {
  id: string;
  type: 'RC' | 'INSURANCE' | 'PUC' | 'PERMIT' | 'FITNESS' | 'TAX';
  documentNumber?: string;
  expiryDate?: string;
  overrideAt?: string | null;
  vehicle?: { registrationNumber: string; make: string; model: string };
}

export type DriverStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';

export interface Driver {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry?: string;
  status: DriverStatus;
  monthlySalary?: string;
  account?: { id: string; phone: string; isActive: boolean } | null;
}

export interface Customer {
  id: string;
  branchId: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  isBlacklisted: boolean;
}

export type VendorStatus = 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';

export interface Vendor {
  id: string;
  branchId: string;
  companyName: string;
  gstin: string;
  billingAddress: string;
  placeOfSupplyStateCode: string;
  contactName?: string;
  contactPhone?: string;
  status: VendorStatus;
  billingCycleDay: number;
  creditTermDays: number;
}

export interface VendorRateCardItem {
  id: string;
  categoryId: string;
  category?: VehicleCategory;
  fixedMonthlyAmount?: string;
  includedKm?: number;
  includedHours?: number;
  extraKmRate?: string;
  extraHourRate?: string;
  slabLabel?: string;
  slabHours?: number;
  slabKm?: number;
  slabBaseRate?: string;
  extraKmRateSpot?: string;
  extraHourRateSpot?: string;
}

export interface VendorRateCard {
  id: string;
  engagementType: 'DEDICATED_MONTHLY' | 'SPOT_DUTY';
  effectiveFrom: string;
  effectiveTo?: string;
  items: VendorRateCardItem[];
}

export interface RateCardItem {
  id: string;
  categoryId: string;
  category?: VehicleCategory;
  slabLabel?: string;
  slabHours?: number;
  slabKm?: number;
  slabBaseRate?: string;
  extraKmRate?: string;
  extraHourRate?: string;
  perKmRate?: string;
  minKmPerDay?: number;
  driverBattaPerDay?: string;
  nightHaltRate?: string;
  routeLabel?: string;
  flatRate?: string;
  fixedMonthlyAmount?: string;
  includedKm?: number;
  includedHours?: number;
}

export interface RateCard {
  id: string;
  type: 'LOCAL_PACKAGE' | 'OUTSTATION' | 'AIRPORT_TRANSFER' | 'FIXED_DUTY_MONTHLY';
  effectiveFrom: string;
  effectiveTo?: string;
  items: RateCardItem[];
}

export type BookingStatus = 'INQUIRY' | 'QUOTED' | 'CONFIRMED' | 'DUTY_ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'CANCELLED' | 'NO_SHOW';
export type BookingType = 'LOCAL_PACKAGE' | 'OUTSTATION' | 'AIRPORT_TRANSFER';

export interface Booking {
  id: string;
  branchId: string;
  bookingNumber: string;
  customerId: string;
  customer?: Customer;
  type: BookingType;
  status: BookingStatus;
  pickupLocation: string;
  dropLocation?: string;
  pickupDateTime: string;
  dropDateTime?: string;
  outstationDays?: number;
  vehicleId?: string;
  vehicle?: Vehicle;
  quotedAmount?: string;
  advanceAmount: string;
  discountAmount: string;
  duties?: Duty[];
}

export type DutyStatus = 'ASSIGNED' | 'ACCEPTED' | 'DECLINED' | 'STARTED' | 'COMPLETED' | 'SUBMITTED' | 'REJECTED' | 'APPROVED' | 'DISPUTED' | 'RESOLVED' | 'BILLED';
export type DutyOrigin = 'BOOKING' | 'DEPLOYMENT' | 'VENDOR_SPOT';

export interface Duty {
  id: string;
  branchId: string;
  origin: DutyOrigin;
  bookingId?: string;
  deploymentId?: string;
  vendorId?: string;
  vendor?: { id: string; companyName: string };
  driverId: string;
  driver?: { id: string; name: string; phone: string };
  vehicleId: string;
  vehicle?: { id: string; registrationNumber: string; make?: string; model?: string };
  status: DutyStatus;
  scheduledStart: string;
  scheduledEnd?: string;
  openingOdometer?: number;
  openingOdometerPhotoKey?: string;
  closingOdometer?: number;
  closingOdometerPhotoKey?: string;
  disputeReason?: string;
  rejectionReason?: string;
}

export interface VehicleDeployment {
  id: string;
  branchId: string;
  counterpartyType: 'VENDOR' | 'CUSTOMER';
  vendorId?: string;
  vendor?: Vendor;
  customerId?: string;
  customer?: Customer;
  defaultDriverId?: string;
  defaultDriver?: { id: string; name: string };
  startDate: string;
  endDate?: string;
  status: string;
  vehicleSegments?: DeploymentVehicleSegment[];
}

export interface DeploymentVehicleSegment {
  id: string;
  deploymentId: string;
  vehicleId: string;
  vehicle?: Vehicle;
  startDate: string;
  endDate?: string | null;
  openingOdometer: number;
  closingOdometer?: number;
  replacementReason?: string;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';
export type InvoiceType = 'VENDOR_MONTHLY' | 'CUSTOMER_FIXED_DUTY_MONTHLY' | 'BOOKING';

export interface InvoiceLineItem {
  id: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unitRate: string;
  taxableValue: string;
  gstRatePct: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  branchId: string;
  invoiceNumber: string;
  type: InvoiceType;
  vendorId?: string;
  vendor?: { companyName: string };
  customerId?: string;
  customer?: { name: string };
  bookingId?: string;
  supplierGstin: string;
  recipientGstin?: string;
  placeOfSupplyStateCode: string;
  taxType: 'CGST_SGST' | 'IGST';
  issueDate: string;
  dueDate?: string;
  status: InvoiceStatus;
  subtotal: string;
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  roundingAdjustment: string;
  totalAmount: string;
  amountPaid: string;
  lineItems?: InvoiceLineItem[];
  paymentAllocations?: Array<{ id: string; amount: string; payment: { mode: string; reference?: string; receivedAt: string } }>;
  creditNotes?: Array<{ id: string; creditNoteNumber: string; reason: string; totalAmount: string }>;
}

export interface ReconciliationLine {
  id: string;
  reconciliationId: string;
  dutyId?: string;
  deploymentId?: string;
  description: string;
  computedAmount: string;
  claimedAmount?: string;
  disputeStatus: 'NONE' | 'OPEN' | 'ADJUSTED' | 'ACCEPTED';
  disputeReason?: string;
  adjustmentAmount: string;
  adjustmentReason?: string;
  finalAmount: string;
}

export interface MonthlyReconciliation {
  id: string;
  counterpartyType: 'VENDOR' | 'CUSTOMER';
  vendorId?: string;
  customerId?: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'STATEMENT_SENT' | 'DISPUTED' | 'FINALIZED' | 'INVOICED';
  invoiceId?: string;
  lines: ReconciliationLine[];
}

export interface Expense {
  id: string;
  branchId: string;
  category: 'FUEL' | 'TOLL' | 'MAINTENANCE' | 'INSURANCE' | 'EMI' | 'SALARY' | 'CHALLAN' | 'MISC';
  vehicleId?: string;
  vehicle?: { registrationNumber: string };
  description: string;
  amount: string;
  expenseDate: string;
}

export interface MaintenanceJob {
  id: string;
  vehicleId: string;
  type: 'SCHEDULED' | 'BREAKDOWN';
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  description: string;
  cost?: string;
  serviceDate?: string;
  nextDueDate?: string;
}

export interface PageResult<T> {
  data: T[];
  meta: { nextCursor: string | null; limit: number };
}
