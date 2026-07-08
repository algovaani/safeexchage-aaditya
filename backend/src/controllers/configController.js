import { success } from '../utils/response.js';
import { getPlatformSettings, formatPublicSettings } from '../services/platformSettingsService.js';

/** Public platform config (no auth) — USDT/INR rate for balance display. */
export async function getPublicConfig(_req, res, next) {
  try {
    const doc = await getPlatformSettings();
    const settings = formatPublicSettings(doc);
    return success(res, {
      usdt_inr_rate: settings.usdtInrRate,
    });
  } catch (e) {
    return next(e);
  }
}
