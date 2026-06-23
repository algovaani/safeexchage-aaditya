import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
  errors: unknown;
  timestamp: string;
};

export type WalletBalance = { balance: string; lockedBalance: string; total: string };

export type AuthPayload = {
  user: {
    id: string;
    email: string;
    mobile: string | null;
    name: string | null;
    role: string;
    emailVerified: boolean;
  };
  accessToken: string;
  refreshToken: string;
};

export function unwrap<T = unknown>(res: { data: ApiResponse<T> }): T {
  if (!res.data.success) throw new Error(res.data.message || 'Request failed');
  return res.data.data;
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('safex_access');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const msg = error.response?.data?.message || error.message || 'Request failed';
    error.message = msg;
    return Promise.reject(error);
  }
);
