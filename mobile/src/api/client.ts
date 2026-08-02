import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import type { DriverLoginResponse } from './types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const ACCESS_KEY = 'ucr_driver_access_token';
const REFRESH_KEY = 'ucr_driver_refresh_token';
const DRIVER_KEY = 'ucr_driver_info';

export async function getStoredAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}
export async function getStoredRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}
export async function getStoredDriver() {
  const raw = await SecureStore.getItemAsync(DRIVER_KEY);
  return raw ? (JSON.parse(raw) as DriverLoginResponse['driver']) : null;
}
export async function storeSession(res: DriverLoginResponse) {
  await SecureStore.setItemAsync(ACCESS_KEY, res.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken);
  await SecureStore.setItemAsync(DRIVER_KEY, JSON.stringify(res.driver));
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(DRIVER_KEY);
}

export const api = axios.create({ baseURL: API_URL.replace(/\/api\/?$/, '/api/driver/v1') });

api.interceptors.request.use(async (config) => {
  const token = await getStoredAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Same dedupe pattern as the web client: concurrent 401s share one refresh call.
let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${API_URL.replace(/\/api\/?$/, '/api/driver/v1')}/auth/refresh`,
      { refreshToken }
    );
    await SecureStore.setItemAsync(ACCESS_KEY, res.data.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, res.data.refreshToken);
    return res.data.accessToken;
  } catch {
    await clearSession();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshInFlight ??= performRefresh().finally(() => {
        refreshInFlight = null;
      });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }
    }
    return Promise.reject(error);
  }
);

export function extractApiError(err: unknown): { message: string; field?: string } {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; field?: string } | undefined;
    if (data?.message) return { message: data.message, field: data.field };
    if (err.message === 'Network Error') return { message: 'No connection — saved locally, will sync when back online.' };
  }
  return { message: 'Something went wrong.' };
}
