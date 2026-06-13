import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, parseApiResponse, setAuthToken } from '../api/client.js';

const AuthContext = createContext(null);

const STORAGE_KEY = 'safex_token';
const LEGACY_STORAGE_KEY = 'vencrypto_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
    return null;
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        setUser(parseApiResponse(data));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const login = async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    const payload = parseApiResponse(data);
    localStorage.setItem(STORAGE_KEY, payload.token);
    setToken(payload.token);
    setUser(payload.user);
    return payload;
  };

  const register = async (body) => {
    const { data } = await api.post('/auth/register', body);
    const payload = parseApiResponse(data);
    localStorage.setItem(STORAGE_KEY, payload.token);
    setToken(payload.token);
    setUser(payload.user);
    return payload;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore — clear local session anyway */
    }
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      register,
      logout,
      isAdmin: user?.role === 'admin',
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
