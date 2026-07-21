import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

import { apiRequest } from '../api/client';
import type { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (payload: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const signIn = useCallback(async (payload: { email: string; password: string }) => {
    const response = await apiRequest<{ user: User }>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    setUser(response.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest<{ message: string }>('/api/auth/signout', {
        method: 'POST'
      });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      refreshUser
    }),
    [loading, refreshUser, signIn, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
