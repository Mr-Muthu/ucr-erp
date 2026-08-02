import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../api/endpoints';
import { clearSession, getStoredDriver, getStoredRefreshToken, storeSession } from '../api/client';
import { getDeviceInfo } from './device';
import { clearDutiesCache } from '../db/dutiesCache';
import { clearOutbox } from '../db/outbox';
import type { DriverInfo } from '../api/types';

interface AuthContextValue {
  driver: DriverInfo | null;
  loading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getStoredDriver();
      const refreshToken = await getStoredRefreshToken();
      if (stored && refreshToken) setDriver(stored);
      setLoading(false);
    })();
  }, []);

  async function login(phone: string, pin: string) {
    const device = await getDeviceInfo();
    const previousDriver = await getStoredDriver();
    const res = await authApi.login(phone, pin, device);
    // The local SQLite cache/outbox is a shared file on the device, not
    // scoped per account — if a different driver is signing in on this
    // phone (a shared company device, a wrong-account mistake, etc.),
    // wipe it first. Otherwise the new driver would see the previous
    // driver's cached duties, and any of their own un-synced offline
    // actions would risk syncing under the new driver's identity.
    if (previousDriver && previousDriver.id !== res.driver.id) {
      await clearDutiesCache();
      await clearOutbox();
    }
    await storeSession(res);
    setDriver(res.driver);
  }

  async function logout() {
    const refreshToken = await getStoredRefreshToken();
    await clearSession();
    setDriver(null);
    if (refreshToken) authApi.logout(refreshToken).catch(() => undefined);
  }

  return <AuthContext.Provider value={{ driver, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
