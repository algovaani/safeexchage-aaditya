import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  email: string;
  mobile: string | null;
  name: string | null;
  role: string;
  emailVerified: boolean;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('safex_access', accessToken);
        }
        set({ user, accessToken, refreshToken });
      },
      clearAuth: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('safex_access');
        }
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    { name: 'safex-auth' }
  )
);
