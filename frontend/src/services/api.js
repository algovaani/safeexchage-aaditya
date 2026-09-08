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

const DEFAULT_TIMEOUT_MS = 10_000;
const AUTH_TIMEOUT_MS = 12_000;
const MAX_NETWORK_RETRIES = 1;

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: DEFAULT_TIMEOUT_MS,
});

function isAuthUrl(url = '') {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/admin/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/otp/') ||
    url.includes('/auth/forgot-password') ||
    url.includes('/auth/reset-password')
  );
}

function isRetryableNetworkError(error) {
  if (error.response) return false;
  const code = error.code || '';
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    msg.includes('network error') ||
    msg.includes('timeout')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    path === '/futures' ||
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
  const url = config.url || '';
  if (isAuthUrl(url)) {
    config.timeout = AUTH_TIMEOUT_MS;
  }
  return config;
});

function isAuthAttempt(url = '') {
  return isAuthUrl(url);
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
    const code = error.code || '';
    const base = resolveBaseUrl();
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
      return 'Server is taking too long to respond. Please wait a moment and try again.';
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Check your internet connection and try again.';
    }

    if (isLocal) {
      return `Cannot reach API (${base}). Ensure the backend is running, then refresh and try again.`;
    }

    return 'Cannot reach the server right now. Please try again in a few seconds.';
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
      const bizStatus = response.data?.data?.status;
      emitToast({
        type: bizStatus === 'rejected' ? 'error' : 'success',
        message: getSuccessMessage(response),
      });
    }

    return response;
  },
  async (error) => {
    const config = error.config || {};
    const requestUrl = config.url || '';

    // Auto-retry transient network/timeout failures (common on mobile 4G/5G).
    const retryCount = config.__retryCount || 0;
    if (isRetryableNetworkError(error) && retryCount < MAX_NETWORK_RETRIES && !config.__noRetry) {
      config.__retryCount = retryCount + 1;
      await sleep(250 * config.__retryCount);
      return api.request(config);
    }

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
  loginOtp: (mobile, otp) => unwrap(api.post('/auth/login/otp', { mobile, otp })),
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
  cancel: (id) => unwrap(api.post(`/withdrawals/${id}/cancel`)),
};

export const cashInPersonAPI = {
  submit: (body) => unwrap(api.post('/cash-in-person/submit', body)),
  getHistory: () => unwrap(api.get('/cash-in-person/history')),
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
  getPairs: () => unwrap(api.get('/market/pairs')),
  getDepth: (symbol, limit = 20) =>
    unwrap(api.get('/market/depth', { params: { symbol, limit } })),
};

export const adminTradingPairsAPI = {
  list: (params) => unwrap(api.get('/admin/trading-pairs', { params })),
  searchCoins: (q) => unwrap(api.get('/admin/trading-pairs/coins/search', { params: { q } })),
  lookupContract: (address, chain) =>
    unwrap(api.get('/admin/trading-pairs/coins/contract', { params: { address, chain } })),
  previewDex: (chain, pair) =>
    unwrap(api.get('/admin/trading-pairs/coins/dex', { params: { chain, pair } })),
  create: (body) => unwrap(api.post('/admin/trading-pairs', body)),
  update: (id, body) => unwrap(api.patch(`/admin/trading-pairs/${id}`, body)),
  remove: (id) => unwrap(api.delete(`/admin/trading-pairs/${id}`)),
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
  deletePlan: (id) => unwrap(api.delete(`/admin/staking/plans/${id}`)),
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

export const marketingAPI = {
  getActiveBanners: () => unwrap(api.get('/marketing/banners/active')),
  getActiveNotices: () => unwrap(api.get('/marketing/notices/active')),
  getSupportContacts: () => unwrap(api.get('/marketing/support/contacts')),
};

export const adminMarketingAPI = {
  // Banners
  listBanners: () => unwrap(api.get('/admin/marketing/banners')),
  createBanner: (body) => unwrap(api.post('/admin/marketing/banners', body)),
  createBannerWithImage: (formData) =>
    unwrap(api.post('/admin/marketing/banners', formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
  updateBanner: (id, body) => unwrap(api.patch(`/admin/marketing/banners/${id}`, body)),
  deleteBanner: (id) => unwrap(api.delete(`/admin/marketing/banners/${id}`)),

  // Notices
  listNotices: () => unwrap(api.get('/admin/marketing/notices')),
  createNotice: (body) => unwrap(api.post('/admin/marketing/notices', body)),
  createNoticeWithImage: (formData) =>
    unwrap(api.post('/admin/marketing/notices', formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
  updateNotice: (id, body) => unwrap(api.patch(`/admin/marketing/notices/${id}`, body)),
  deleteNotice: (id) => unwrap(api.delete(`/admin/marketing/notices/${id}`)),

  // Support contacts
  listSupportContacts: () => unwrap(api.get('/admin/marketing/support-contacts')),
  createSupportContact: (body) => unwrap(api.post('/admin/marketing/support-contacts', body)),
  updateSupportContact: (id, body) => unwrap(api.patch(`/admin/marketing/support-contacts/${id}`, body)),
};