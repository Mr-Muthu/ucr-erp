import api from './client';

// Generic REST helpers reused by the CrudPage component for simple
// list/create/update/delete modules (vehicles, drivers, customers, expenses...).
export function createResource(basePath) {
  return {
    list: (params) => api.get(basePath, { params }).then((r) => r.data),
    get: (id) => api.get(`${basePath}/${id}`).then((r) => r.data),
    create: (data) => api.post(basePath, data).then((r) => r.data),
    update: (id, data) => api.patch(`${basePath}/${id}`, data).then((r) => r.data),
    remove: (id) => api.delete(`${basePath}/${id}`).then((r) => r.data),
  };
}

export const vehiclesApi = {
  ...createResource('/vehicles'),
  addDocument: (id, data) => api.post(`/vehicles/${id}/documents`, data).then((r) => r.data),
  removeDocument: (id, docId) => api.delete(`/vehicles/${id}/documents/${docId}`).then((r) => r.data),
  expiringDocuments: (days = 30) => api.get('/vehicles/expiring-documents', { params: { days } }).then((r) => r.data),
};

export const driversApi = createResource('/drivers');
export const customersApi = createResource('/customers');
export const maintenanceApi = createResource('/maintenance');
export const expensesApi = createResource('/expenses');

export const bookingsApi = {
  ...createResource('/bookings'),
  updateStatus: (id, status, odometer) =>
    api.patch(`/bookings/${id}/status`, { status, odometer }).then((r) => r.data),
  checkAvailability: (params) => api.get('/bookings/availability', { params }).then((r) => r.data),
};

export const invoicesApi = {
  ...createResource('/invoices'),
  generate: (data) => api.post('/invoices/generate', data).then((r) => r.data),
  addItem: (id, data) => api.post(`/invoices/${id}/items`, data).then((r) => r.data),
  updateStatus: (id, status) => api.patch(`/invoices/${id}/status`, { status }).then((r) => r.data),
};

export const paymentsApi = {
  list: (params) => api.get('/payments', { params }).then((r) => r.data),
  create: (data) => api.post('/payments', data).then((r) => r.data),
};

export const dashboardApi = {
  summary: () => api.get('/dashboard/summary').then((r) => r.data),
};
