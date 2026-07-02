import axios from 'axios';
import { getErrorMessage, getSuccessMessage } from '../utils/apiMessage.js';
import { emitToast } from '../utils/toastBus.js';

const TOKEN_KEY = 'safex_token';
const LEGACY_TOKEN_KEY = 'vencrypto_token';

function resolveBaseUrl() {
  const vite = import.meta.env.VITE_API_URL;
  const cra = typeof process !== 'undefined' ? process.env?.REACT_APP_API_URL : undefined;
  let url = String(vite || cra || '/api').trim().replace(/\/+$/, '');

  // https://api.safexchange.io → https://api.safexchange.io/api
  if (/^https?:\/\//i.test(url) && !url.endsWith('/api')) {
    url = `${url}/api`;
  }

  return url;
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

function clearAuthAndRedirect() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  setAuthToken(null);

  const path = window.location.pathname;
  const isPublicAuth =
    path === '/' ||
    path === '/login' ||
    path === '/signup' ||
    path === '/trade' ||
    path.startsWith('/admin/login');

  if (!isPublicAuth) {
    window.location.href = '/login';
  }
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function isAuthAttempt(url = '') {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/admin/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/otp/') ||
    url.includes('/auth/forgot-password') ||
    url.includes('/auth/reset-password')
  );
}

function formatApiError(error) {
  const payload = error.response?.data;

  if (payload?.message) {
    if (Array.isArray(payload.errors) && payload.errors.length) {
      const details = payload.errors
        .map((e) => e.msg || e.message)
        .filter(Boolean)
        .join('. ');
      return details ? `${payload.message}: ${details}` : payload.message;
    }
    return payload.message;
  }

  if (payload?.error) return payload.error;

  if (!error.response) {
    const base = resolveBaseUrl();
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isLocal) {
      return `Cannot reach API (${base}). Ensure the backend is running, then refresh and try again.`;
    }
    return 'Cannot reach API. Check your internet connection and try again.';
  }

  return error.message || 'Request failed';
}

function isMutationMethod(method = '') {
  return ['post', 'put', 'patch', 'delete'].includes(String(method).toLowerCase());
}

/** @param {unknown} err */
export function getApiErrorMessage(err) {
  return getErrorMessage(err);
}

api.interceptors.response.use(
  (response) => {
    const config = response.config || {};
    const method = config.method;
    const requestUrl = config.url || '';

    if (
      isMutationMethod(method) &&
      !config.silentToast &&
      !isAuthAttempt(requestUrl) &&
      response.data?.success !== false
    ) {
      emitToast({
        type: 'success',
        message: getSuccessMessage(response),
      });
    }

    return response;
  },
  (error) => {
    const config = error.config || {};
    const requestUrl = config.url || '';

    if (error.response?.status === 401 && !isAuthAttempt(requestUrl)) {
      clearAuthAndRedirect();
    }

    error.message = formatApiError(error);

    if (
      isMutationMethod(config.method) &&
      !config.silentToast &&
      !isAuthAttempt(requestUrl) &&
      error.response?.status !== 401
    ) {
      emitToast({
        type: 'error',
        message: getErrorMessage(error),
      });
    }

    return Promise.reject(error);
  }
);

/** Extract payload from { success, message, data } or legacy raw responses */
export function parseApiResponse(data) {
  if (data && typeof data === 'object' && 'success' in data) {
    if (!data.success) {
      throw new Error(data.message || 'Request failed');
    }
    return data.data;
  }
  return data;
}

async function unwrap(promise) {
  const { data } = await promise;
  return parseApiResponse(data);
}

export const authAPI = {
  sendOtp: (mobile, purpose) => unwrap(api.post('/auth/otp/send', { mobile, purpose })),
  resendOtp: (mobile, purpose) => unwrap(api.post('/auth/otp/resend', { mobile, purpose })),
  register: (body) => unwrap(api.post('/auth/register', body)),
  login: (mobile, password) => unwrap(api.post('/auth/login', { mobile, password })),
  adminLogin: (email, password) => unwrap(api.post('/auth/admin/login', { email, password })),
  logout: () => unwrap(api.post('/auth/logout')),
  me: () => unwrap(api.get('/auth/me')),
  updateProfile: (body) => unwrap(api.patch('/auth/profile', body)),
  forgotPassword: (identifier) => unwrap(api.post('/auth/forgot-password', { identifier })),
  resetPassword: (body) => unwrap(api.post('/auth/reset-password', body)),
};

export const kycAPI = {
  getStatus: () => unwrap(api.get('/kyc/status')),
  submit: (formData) =>
    unwrap(
      api.post('/kyc/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ),
};

export const withdrawalAPI = {
  submitCrypto: (body) => unwrap(api.post('/withdrawal/crypto/submit', body)),
  submitFiat: (body) => unwrap(api.post('/withdrawal/fiat/submit', body)),
  getHistory: () => unwrap(api.get('/withdrawals/history')),
};

export const depositAPI = {
  getPlatformInfo: () => unwrap(api.get('/deposit/platform-info')),
  getAddresses: (chain) =>
    unwrap(api.get('/deposit/addresses', { params: chain ? { chain } : undefined })),
  getCryptoAddress: (chain, currency) =>
    unwrap(api.get('/deposit/crypto/address', { params: { chain, ...(currency ? { currency } : {}) } })),
  submitCrypto: (body) => unwrap(api.post('/deposit/crypto/submit', body)),
  submitFiat: (formData) =>
    unwrap(
      api.post('/deposit/fiat/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ),
  getHistory: () => unwrap(api.get('/deposits/history')),
};

export const marketAPI = {
  getAllPrices: () => unwrap(api.get('/market/prices')),
  getPairPrice: (symbol) => unwrap(api.get(`/market/prices/${encodeURIComponent(symbol)}`)),
  getLivePrices: () => unwrap(api.get('/market/prices/live')),
};

export const tradeAPI = {
  getOpenTrades: () => unwrap(api.get('/trades/open')),
  joinTrade: (tradeId, marginAmount) =>
    unwrap(api.post('/trades/join', { trade_id: tradeId, margin_amount: marginAmount })),
  getOpenPositions: () => unwrap(api.get('/trades/positions/open')),
  getHistory: (params) => unwrap(api.get('/trades/positions/history', { params })),
};

export const stakingAPI = {
  getPlans: () => unwrap(api.get('/staking/plans')),
  stake: (planId, amount) => unwrap(api.post('/staking/stake', { plan_id: planId, amount })),
  getPortfolio: () => unwrap(api.get('/staking/portfolio')),
  withdraw: (stakeId) => unwrap(api.post(`/staking/withdraw/${stakeId}`)),
};

export const adminStakingAPI = {
  getPlans: () => unwrap(api.get('/admin/staking/plans')),
  createPlan: (body) => unwrap(api.post('/admin/staking/plans', body)),
  updatePlan: (id, body) => unwrap(api.patch(`/admin/staking/plans/${id}`, body)),
  getStakes: (params) => unwrap(api.get('/admin/staking/stakes', { params })),
  reviewStake: (id, body) => unwrap(api.patch(`/admin/staking/stakes/${id}/review`, body)),
  releasePayout: (id) => unwrap(api.post(`/admin/staking/stakes/${id}/release-payout`)),
};

export const dashboardAPI = {
  getSummary: () => unwrap(api.get('/dashboard/summary')),
  getPortfolio: () => unwrap(api.get('/dashboard/portfolio')),
  getTransactions: (params) => unwrap(api.get('/transactions', { params })),
};

export const walletAPI = {
  getBalance: () => unwrap(api.get('/wallet/balance')),
};