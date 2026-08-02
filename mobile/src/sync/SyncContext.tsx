import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { runSync } from './syncEngine';
import { countPending } from '../db/outbox';

interface SyncContextValue {
  pendingCount: number;
  syncing: boolean;
  isOnline: boolean;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const AUTO_SYNC_INTERVAL_MS = 20_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await countPending());
  }, []);

  const triggerSync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const state = await Network.getNetworkStateAsync();
      setIsOnline(Boolean(state.isConnected));
      if (state.isConnected) {
        await runSync();
        setLastSyncedAt(new Date());
      }
    } finally {
      await refreshPendingCount();
      setSyncing(false);
      inFlight.current = false;
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    triggerSync();

    // expo-network (SDK 51) has no change-listener API, only a point-in-time
    // check — so connectivity recovery is caught by polling, not a push event.
    const interval = setInterval(triggerSync, AUTO_SYNC_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') triggerSync();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SyncContext.Provider value={{ pendingCount, syncing, isOnline, lastSyncedAt, triggerSync }}>{children}</SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
