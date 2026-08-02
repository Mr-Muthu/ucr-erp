import { api } from './client';
import type { Duty, DriverDevice, DriverLoginResponse, SyncItemResult, UploadPresignResponse, UploadPurpose } from './types';

export const authApi = {
  login: (phone: string, pin: string, device: DriverDevice) =>
    api.post<DriverLoginResponse>('/auth/login', { phone, pin, device }).then((r) => r.data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const dutiesApi = {
  list: () => api.get<{ data: Duty[] }>('/duties').then((r) => r.data.data),
  get: (id: string) => api.get<Duty>(`/duties/${id}`).then((r) => r.data),
};

export const syncApi = {
  push: (items: unknown[]) => api.post<{ results: SyncItemResult[] }>('/sync', { items }).then((r) => r.data.results),
};

export const uploadsApi = {
  presign: (purpose: UploadPurpose, contentType: string, extension: string) =>
    api.post<UploadPresignResponse>('/uploads/presign', { purpose, contentType, extension }).then((r) => r.data),
};
