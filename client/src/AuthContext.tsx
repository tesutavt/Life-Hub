import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  username: string;
  role: 'user' | 'moderator' | 'admin';
  isVerified: boolean;
  avatarUrl?: string | null;
};

type AuthCtx = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  setToken: (token: string | null) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx>({
  token: null,
  user: null,
  loading: false,
  setToken: () => {},
  refreshUser: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!localStorage.getItem('token'));

  const setToken = (nextToken: string | null) => {
    setTokenState(nextToken);
    if (!nextToken) {
      setUser(null);
      setLoading(false);
    }
  };

  const logout = () => setToken(null);

  const refreshUser = async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Повторная загрузка «тихая»: если пользователь уже есть, не показываем заглушку,
    // иначе всё приложение размонтируется и потеряет состояние (например, мастер приветствия).
    if (!user) setLoading(true);
    try {
      const response = await api.get('/api/auth/me', { silentError: true });
      setUser(response?.user || null);
    } catch {
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }, [token]);

  useEffect(() => {
    refreshUser();
  }, [token]);

  const value = useMemo(
    () => ({ token, user, loading, setToken, refreshUser, logout }),
    [token, user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
