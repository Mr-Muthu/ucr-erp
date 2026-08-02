import { api } from './client';
import type { PageResult } from '../types/domain';

/** Generic list/get/create/update/delete client matching server/src/lib/crudRouter.ts's shape. */
export function createResource<T>(basePath: string) {
  return {
    list: (params?: Record<string, unknown>) => api.get<PageResult<T>>(basePath, { params }).then((r) => r.data),
    get: (id: string) => api.get<T>(`${basePath}/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post<T>(basePath, data).then((r) => r.data),
    update: (id: string, data: unknown) => api.patch<T>(`${basePath}/${id}`, data).then((r) => r.data),
    remove: (id: string) => api.delete(`${basePath}/${id}`).then((r) => r.data),
  };
}
