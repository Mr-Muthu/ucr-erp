import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/endpoints';
import { clearSession, getStoredRefreshToken, getStoredUser, storeSession, storeUser } from '../api/client';
import type { StaffUser } from '../types/domain';

const IDLE_TIMEOUT_MS = 30 * 60_000; // 30 minutes of no interaction -> auto logout

interface AuthContextValue {
  user: StaffUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(() => getStoredUser<StaffUser>());
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  function logout() {
    const refreshToken = getStoredRefreshToken();
    clearSession();
    setUser(null);
    if (refreshToken) authApi.logout(refreshToken).catch(() => undefined);
    navigate('/login');
  }

  async function login(email: string, password: string) {
    const res = await authApi.login(email, password);
    storeSession(res.accessToken, res.refreshToken);
    storeUser(res.user);
    setUser(res.user);
  }

  // Verify the stored session is still valid on load (token may have expired
  // while the tab was closed).
  useEffect(() => {
    if (!getStoredRefreshToken()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((me) => {
        setUser(me);
        storeUser(me);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle timeout — resets on any user interaction while logged in.
  useEffect(() => {
    if (!user) return;

    function resetTimer() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        toast.error('Signed out after 30 minutes of inactivity');
        logout();
      }, IDLE_TIMEOUT_MS);
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
