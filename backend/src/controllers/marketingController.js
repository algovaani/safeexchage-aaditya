import { success, error } from '../utils/response.js';
import { MarketingBanner, MarketingNotice, SupportContact } from '../models/Marketing.js';
import { storedFilePath as storedBannerFilePath } from '../middleware/marketingBannerUpload.js';
import { storedFilePath as storedNoticeFilePath } from '../middleware/marketingNoticeUpload.js';
import { toPublicFileUrl } from '../utils/fileUrl.js';

function toAdminCreatedBy(req) {
  // authMiddleware attaches userId as string
  return req.userId ? String(req.userId) : null;
}

function sortByDefault(field = 'sortOrder') {
  return { sortOrder: 1, createdAt: -1, [field]: 1 };
}

function toPublicSupportContact(row, userCanSeeDetails = false) {
  const showContactDetails = Boolean(userCanSeeDetails);
  const email = String(row.email || '').trim();
  const phone = showContactDetails ? String(row.phone || '').trim() : '';
  const name = showContactDetails ? String(row.name || '').trim() : '';

  return {
    _id: row._id,
    id: row._id,
    enabled: row.enabled,
    name,
    phone,
    email,
    showContactDetails,
    showName: showContactDetails && Boolean(name),
    showPhone: showContactDetails && Boolean(phone),
    showEmail: Boolean(email),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------
// Admin: Banners
// ---------------------------
export async function listBanners(req, res, next) {
  try {
    const rows = await MarketingBanner.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    const payload = rows.map((b) => ({
      ...b,
      imageUrl: b.imageUrl ? toPublicFileUrl(req, b.imageUrl) : '',
    }));
    return success(res, payload, 'Banners fetched');
  } catch (e) {
    return next(e);
  }
}

export async function createBanner(req, res, next) {
  try {
    const doc = await MarketingBanner.create({
      message: req.body.message,
      imageUrl: req.file ? storedBannerFilePath(req.file.filename) : req.body.imageUrl || '',
      enabled: Boolean(req.body.enabled),
      sortOrder: req.body.sortOrder ?? 0,
      createdBy: toAdminCreatedBy(req),
    });
    return success(res, doc.toObject(), 'Banner created', 201);
  } catch (e) {
    return next(e);
  }
}

export async function updateBanner(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await MarketingBanner.findByIdAndUpdate(
      id,
      {
        ...(req.body.message != null ? { message: req.body.message } : {}),
        ...(req.body.imageUrl != null ? { imageUrl: String(req.body.imageUrl).trim() } : {}),
        ...(req.body.enabled != null ? { enabled: Boolean(req.body.enabled) } : {}),
        ...(req.body.sortOrder != null ? { sortOrder: req.body.sortOrder } : {}),
      },
      { new: true }
    ).lean();

    if (!doc) return error(res, 'Banner not found', 404);
    return success(res, doc, 'Banner updated');
  } catch (e) {
    return next(e);
  }
}

export async function deleteBanner(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await MarketingBanner.findByIdAndDelete(id).lean();
    if (!doc) return error(res, 'Banner not found', 404);
    return success(res, doc, 'Banner deleted');
  } catch (e) {
    return next(e);
  }
}

// ---------------------------
// Admin: Notices
// ---------------------------
export async function listNotices(req, res, next) {
  try {
    const rows = await MarketingNotice.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    const payload = rows.map((n) => ({
      ...n,
      imageUrl: n.imageUrl ? toPublicFileUrl(req, n.imageUrl) : '',
    }));
    return success(res, payload, 'Notices fetched');
  } catch (e) {
    return next(e);
  }
}

export async function createNotice(req, res, next) {
  try {
    const doc = await MarketingNotice.create({
      title: req.body.title,
      message: req.body.message,
      imageUrl: req.file ? storedNoticeFilePath(req.file.filename) : req.body.imageUrl || '',
      enabled: Boolean(req.body.enabled),
      sortOrder: req.body.sortOrder ?? 0,
      createdBy: toAdminCreatedBy(req),
    });
    return success(res, doc.toObject(), 'Notice created', 201);
  } catch (e) {
    return next(e);
  }
}

export async function updateNotice(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await MarketingNotice.findByIdAndUpdate(
      id,
      {
        ...(req.body.title != null ? { title: req.body.title } : {}),
        ...(req.body.message != null ? { message: req.body.message } : {}),
        ...(req.body.enabled != null ? { enabled: Boolean(req.body.enabled) } : {}),
        ...(req.body.sortOrder != null ? { sortOrder: req.body.sortOrder } : {}),
      },
      { new: true }
    ).lean();

    if (!doc) return error(res, 'Notice not found', 404);
    return success(res, doc, 'Notice updated');
  } catch (e) {
    return next(e);
  }
}

export async function deleteNotice(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await MarketingNotice.findByIdAndDelete(id).lean();
    if (!doc) return error(res, 'Notice not found', 404);
    return success(res, doc, 'Notice deleted');
  } catch (e) {
    return next(e);
  }
}

// ---------------------------
// Admin: Support Contacts
// ---------------------------
export async function listSupportContacts(req, res, next) {
  try {
    const rows = await SupportContact.find({})
      .sort({ enabled: -1, createdAt: -1 })
      .lean();
    return success(res, rows, 'Support contacts fetched');
  } catch (e) {
    return next(e);
  }
}

export async function createSupportContact(req, res, next) {
  try {
    const doc = await SupportContact.create({
      enabled: req.body.enabled == null ? true : Boolean(req.body.enabled),
      name: req.body.name,
      phone: req.body.phone || '',
      email: req.body.email || '',
    });
    return success(res, doc.toObject(), 'Support contact created', 201);
  } catch (e) {
    return next(e);
  }
}

export async function updateSupportContact(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await SupportContact.findByIdAndUpdate(
      id,
      {
        ...(req.body.enabled != null ? { enabled: Boolean(req.body.enabled) } : {}),
        ...(req.body.name != null ? { name: req.body.name } : {}),
        ...(req.body.phone != null ? { phone: req.body.phone } : {}),
        ...(req.body.email != null ? { email: req.body.email } : {}),
      },
      { new: true }
    ).lean();

    if (!doc) return error(res, 'Support contact not found', 404);
    return success(res, doc, 'Support contact updated');
  } catch (e) {
    return next(e);
  }
}

// ---------------------------
// Public: Active data
// ---------------------------
export async function activeBanners(req, res, next) {
  try {
    const rows = await MarketingBanner.find({ enabled: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    const payload = rows.map((b) => ({
      ...b,
      imageUrl: b.imageUrl ? toPublicFileUrl(req, b.imageUrl) : '',
    }));
    return success(res, payload, 'Active banners fetched');
  } catch (e) {
    return next(e);
  }
}

export async function activeNotices(req, res, next) {
  try {
    const rows = await MarketingNotice.find({ enabled: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(10)
      .lean();
    const payload = rows.map((n) => ({
      ...n,
      imageUrl: n.imageUrl ? toPublicFileUrl(req, n.imageUrl) : '',
    }));
    return success(res, payload, 'Active notices fetched');
  } catch (e) {
    return next(e);
  }
}

export async function activeSupportContacts(req, res, next) {
  try {
    const rows = await SupportContact.find({ enabled: true })
      .sort({ createdAt: -1 })
      .lean();
    const userCanSeeDetails = Boolean(req.user?.showSupportContactDetails);
    const payload = rows.map((row) => toPublicSupportContact(row, userCanSeeDetails));
    return success(res, payload, 'Active support contacts fetched');
  } catch (e) {
    return next(e);
  }
}

