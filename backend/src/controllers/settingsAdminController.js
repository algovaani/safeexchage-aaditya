import {
  formatAdminSettings,
  getPlatformSettings,
  updatePlatformSettings,
} from '../services/platformSettingsService.js';
import { success } from '../utils/response.js';

export async function getSettings(_req, res, next) {
  try {
    const doc = await getPlatformSettings({ includeSecrets: true });
    return success(res, formatAdminSettings(doc), 'Platform settings fetched');
  } catch (e) {
    return next(e);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const doc = await updatePlatformSettings(req.userId, req.body);
    return success(res, formatAdminSettings(doc.toObject()), 'Platform settings updated');
  } catch (e) {
    return next(e);
  }
}
