import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, authAPI, parseApiResponse, setAuthToken } from '../api/client.js';

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
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/me', { __noRetry: false });
        if (cancelled) return;
        setUser(parseApiResponse(data));
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        // Only clear session on real auth failures — not timeouts / offline blips
        if (status === 401 || status === 403) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUser(null);
        } else {
          console.warn('[auth] /me failed, keeping session:', err?.message || err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const persistSession = (payload) => {
    localStorage.setItem(STORAGE_KEY, payload.token);
    setToken(payload.token);
    setUser(payload.user);
    return payload;
  };

  const sendOtp = async (mobile, purpose) => authAPI.sendOtp(mobile, purpose);

  const resendOtp = async (mobile, purpose) => authAPI.resendOtp(mobile, purpose);

  const login = async (mobile, password) => {
    const payload = await authAPI.login(mobile, password);
    return persistSession(payload);
  };

  const loginWithOtp = async (mobile, otp) => {
    const payload = await authAPI.loginOtp(mobile, otp);
    return persistSession(payload);
  };

  const adminLogin = async (email, password) => {
    const payload = await authAPI.adminLogin(email, password);
    return persistSession(payload);
  };

  const register = async (body) => {
    const payload = await authAPI.register(body);
    return persistSession(payload);
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

  const refreshUser = async () => {
    const { data } = await api.get('/auth/me');
    const profile = parseApiResponse(data);
    setUser(profile);
    return profile;
  };

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      sendOtp,
      resendOtp,
      login,
      loginWithOtp,
      adminLogin,
      register,
      logout,
      refreshUser,
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