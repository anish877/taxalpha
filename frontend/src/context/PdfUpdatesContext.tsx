import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode
} from 'react';

import { apiRequest } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import type { PdfUpdatesResponse } from '../types/api';

type PdfUpdatesListener = (affectedClientIds: string[]) => void;

interface PdfUpdatesContextValue {
  subscribe: (listener: PdfUpdatesListener) => () => void;
}

const PdfUpdatesContext = createContext<PdfUpdatesContextValue | null>(null);

interface PdfUpdatesProviderProps {
  children: ReactNode;
}

const POLL_INTERVAL_MS = 15_000;

export function PdfUpdatesProvider({ children }: PdfUpdatesProviderProps) {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const listenersRef = useRef(new Set<PdfUpdatesListener>());
  const lastCheckedAtRef = useRef<string>(new Date().toISOString());
  const seenIdsRef = useRef(new Set<string>());

  const subscribe = useCallback((listener: PdfUpdatesListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      lastCheckedAtRef.current = new Date().toISOString();
      seenIdsRef.current.clear();
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled || document.visibilityState !== 'visible') {
        return;
      }

      try {
        const response = await apiRequest<PdfUpdatesResponse>(
          `/api/clients/pdfs/updates?after=${encodeURIComponent(lastCheckedAtRef.current)}`
        );
        lastCheckedAtRef.current = response.serverTime;

        const freshUpdates = response.updates.filter((update) => !seenIdsRef.current.has(update.id));
        if (freshUpdates.length === 0) {
          return;
        }

        for (const update of freshUpdates) {
          seenIdsRef.current.add(update.id);
          pushToast(`New PDF received for ${update.clientName} • ${update.workspaceFormTitle}`);
        }

        for (const listener of listenersRef.current) {
          listener(response.affectedClientIds);
        }
      } catch {
        // Ignore transient polling failures and try again on the next interval.
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pushToast, user]);

  const value = useMemo(
    () => ({
      subscribe
    }),
    [subscribe]
  );

  return <PdfUpdatesContext.Provider value={value}>{children}</PdfUpdatesContext.Provider>;
}

export function usePdfUpdates() {
  const context = useContext(PdfUpdatesContext);

  if (!context) {
    throw new Error('usePdfUpdates must be used within PdfUpdatesProvider');
  }

  return context;
}
