import { api } from './client';
import { createResource } from './resources';
import type {
  Booking,
  Customer,
  Driver,
  Expense,
  Invoice,
  MaintenanceJob,
  MonthlyReconciliation,
  RateCard,
  StaffUser,
  Vehicle,
  VehicleCategory,
  VehicleDeployment,
  Vendor,
  VendorRateCard,
  Duty,
} from '../types/domain';

// ── Auth ──
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }).then((r) => r.data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }).then((r) => r.data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get<StaffUser>('/auth/me').then((r) => r.data),
};

// ── Simple CRUD resources ──
export const branchesApi = createResource('/branches');
export const categoriesApi = createResource<VehicleCategory>('/categories');
export const vehiclesApi = {
  ...createResource<Vehicle>('/vehicles'),
  addDocument: (id: string, data: unknown) => api.post(`/vehicles/${id}/documents`, data).then((r) => r.data),
  overrideDocument: (id: string, docId: string, overrideReason: string) =>
    api.post(`/vehicles/${id}/documents/${docId}/override`, { overrideReason }).then((r) => r.data),
  expiringDocuments: (days = 30) => api.get('/vehicles/meta/expiring-documents', { params: { days } }).then((r) => r.data.data),
};
export const driversApi = {
  ...createResource<Driver>('/drivers'),
  deactivate: (id: string) => api.post(`/drivers/${id}/deactivate`).then((r) => r.data),
  licenseOverride: (id: string, overrideReason: string) => api.post(`/drivers/${id}/license-override`, { overrideReason }).then((r) => r.data),
};
export const customersApi = {
  ...createResource<Customer>('/customers'),
  blacklist: (id: string, isBlacklisted: boolean, blacklistReason?: string) =>
    api.patch(`/customers/${id}/blacklist`, { isBlacklisted, blacklistReason }).then((r) => r.data),
};
export const vendorsApi = {
  ...createResource<Vendor>('/vendors'),
  rateCards: (id: string) => api.get(`/vendors/${id}/rate-cards`).then((r) => r.data.data as VendorRateCard[]),
  createRateCard: (id: string, data: unknown) => api.post(`/vendors/${id}/rate-cards`, data).then((r) => r.data),
  addRateCardItem: (id: string, rateCardId: string, data: unknown) =>
    api.post(`/vendors/${id}/rate-cards/${rateCardId}/items`, data).then((r) => r.data),
};
export const rateCardsApi = {
  list: (params?: Record<string, unknown>) => api.get<{ data: RateCard[] }>('/rate-cards', { params }).then((r) => r.data.data),
  create: (data: unknown) => api.post('/rate-cards', data).then((r) => r.data),
  addItem: (id: string, data: unknown) => api.post(`/rate-cards/${id}/items`, data).then((r) => r.data),
};
export const expensesApi = createResource<Expense>('/expenses');
export const maintenanceApi = createResource<MaintenanceJob>('/maintenance');
export const challansApi = createResource('/challans');

// ── Deployments ──
export const deploymentsApi = {
  ...createResource<VehicleDeployment>('/deployments'),
  replaceVehicle: (id: string, data: unknown) => api.post(`/deployments/${id}/replace-vehicle`, data).then((r) => r.data),
  end: (id: string, data: unknown) => api.post(`/deployments/${id}/end`, data),
};

// ── Bookings ──
export const bookingsApi = {
  ...createResource<Booking>('/bookings'),
  transition: (id: string, action: string, extra?: Record<string, unknown>) =>
    api.post(`/bookings/${id}/transition`, { action, ...extra }).then((r) => r.data),
  applyDiscount: (id: string, discountAmount: number) => api.patch(`/bookings/${id}/discount`, { discountAmount }).then((r) => r.data),
  settlementPreview: (id: string) => api.get(`/bookings/${id}/settlement/preview`).then((r) => r.data),
  settlementConfirm: (id: string) => api.post(`/bookings/${id}/settlement/confirm`).then((r) => r.data),
};

// ── Duties ──
export const dutiesApi = {
  ...createResource<Duty>('/duties'),
  transition: (id: string, action: string, reason?: string) => api.post(`/duties/${id}/transition`, { action, reason }).then((r) => r.data),
};

// ── Invoices ──
export const invoicesApi = {
  ...createResource<Invoice>('/invoices'),
  void: (id: string, reason: string) => api.post(`/invoices/${id}/void`, { reason }).then((r) => r.data),
  recordPayment: (id: string, data: { mode: string; amount: number; reference?: string }) =>
    api.post(`/invoices/${id}/payments`, data).then((r) => r.data),
};

// ── Reconciliations (vendor or customer) ──
export function reconciliationsApi(counterpartyType: 'vendors' | 'customers', counterpartyId: string) {
  const base = `/${counterpartyType}/${counterpartyId}/reconciliations`;
  return {
    list: () => api.get<{ data: MonthlyReconciliation[] }>(base).then((r) => r.data.data),
    prepare: (period: string) => api.post(`${base}/${period}/prepare`).then((r) => r.data),
    statement: (period: string) => api.post(`${base}/${period}/statement`).then((r) => r.data),
    adjustLine: (period: string, lineId: string, data: unknown) => api.patch(`${base}/${period}/lines/${lineId}`, data).then((r) => r.data),
    finalize: (period: string) => api.post(`${base}/${period}/finalize`).then((r) => r.data),
  };
}

// ── Availability ──
export const availabilityApi = {
  check: (categoryId: string, start: string, end: string) =>
    api.get('/availability', { params: { categoryId, start, end } }).then((r) => r.data),
};

// ── Dashboard ──
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary').then((r) => r.data),
};

// ── Settings ──
export const settingsApi = {
  list: () => api.get('/settings').then((r) => r.data.data as Array<{ id: string; key: string; value: unknown; description?: string }>),
  update: (key: string, value: unknown) => api.patch(`/settings/${key}`, { value }).then((r) => r.data),
};

// ── Notifications ──
export const notificationsApi = {
  list: () => api.get('/notifications').then((r) => r.data),
};

// ── Reports (Phase 6) ──
export const reportsApi = {
  pnl: (from: string, to: string) => api.get('/reports/pnl', { params: { from, to } }).then((r) => r.data),
  aging: (asOf?: string) => api.get('/reports/aging', { params: asOf ? { asOf } : {} }).then((r) => r.data),
  driverPayables: (periodMonth: string) => api.get('/reports/driver-payables', { params: { periodMonth } }).then((r) => r.data),
  gstSummary: (from: string, to: string) => api.get('/reports/gst-summary', { params: { from, to } }).then((r) => r.data),
};
