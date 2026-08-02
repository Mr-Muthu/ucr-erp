import axios, { type AxiosError } from 'axios';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000/api';

export const api = axios.create({ baseURL: `${BASE_URL}/v1` });

const ACCESS_KEY = 'ucr_access_token';
const REFRESH_KEY = 'ucr_refresh_token';
const USER_KEY = 'ucr_user';

export function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}
export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}
export function storeSession(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}
export function getStoredUser<T>(): T | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}
export function storeUser(user: unknown) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

api.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh-token rotation: on a 401, attempt exactly one refresh even if
// several requests fail concurrently (shared in-flight promise), then
// replay the failed request(s) with the new access token. A hard failure
// here means the session is truly over — clear it and bounce to /login.
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');
  const res = await axios.post(`${BASE_URL}/v1/auth/refresh`, { refreshToken });
  storeSession(res.data.accessToken, res.data.refreshToken);
  return res.data.accessToken as string;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && getStoredRefreshToken()) {
      original._retry = true;
      try {
        refreshInFlight ??= refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
        const newToken = await refreshInFlight;
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      } catch {
        clearSession();
        if (window.location.pathname !== '/login') window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    if (status === 401) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export interface ApiErrorBody {
  code: string;
  message: string;
  field?: string;
}

export function extractApiError(err: unknown): ApiErrorBody {
  if (axios.isAxiosError(err) && err.response?.data) {
    return err.response.data as ApiErrorBody;
  }
  return { code: 'UNKNOWN', message: 'Something went wrong' };
}
