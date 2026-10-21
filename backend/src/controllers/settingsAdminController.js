import path from 'path';
import {
  formatAdminSettings,
  getPlatformSettings,
  updatePlatformSettings,
} from '../services/platformSettingsService.js';
import { error, success } from '../utils/response.js';

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

export async function uploadBankQr(req, res, next) {
  try {
    if (!req.file) {
      return error(res, 'No QR image file uploaded', 400);
    }
    const relativePath = path.join('storage', 'settings', 'qr', req.file.filename).replace(/\\/g, '/');
    const qrUrl = `/${relativePath}`;

    const doc = await updatePlatformSettings(req.userId, { bankQrCode: qrUrl });
    return success(
      res,
      {
        qrCodeUrl: qrUrl,
        settings: formatAdminSettings(doc.toObject()),
      },
      'QR Code uploaded successfully'
    );
  } catch (e) {
    return next(e);
  }
}

export async function removeBankQr(req, res, next) {
  try {
    const doc = await updatePlatformSettings(req.userId, { bankQrCode: '' });
    return success(
      res,
      {
        settings: formatAdminSettings(doc.toObject()),
      },
      'QR Code removed successfully'
    );
  } catch (e) {
    return next(e);
  }
}

