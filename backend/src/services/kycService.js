import path from 'path';
import { toPublicFileUrl } from '../utils/fileUrl.js';
import { storedFilePath } from '../middleware/kycUpload.js';

const FILE_FIELD_MAP = {
  doc_front: 'docFront',
  doc_back: 'docBack',
  selfie: 'selfie',
  address_proof: 'addressProof',
};

export function mapUploadedFiles(multerFiles) {
  const files = {
    docFront: null,
    docBack: null,
    selfie: null,
    addressProof: null,
  };

  for (const [field, arr] of Object.entries(multerFiles || {})) {
    const key = FILE_FIELD_MAP[field];
    const file = arr?.[0];
    if (!key || !file) continue;
    files[key] = {
      path: storedFilePath(path.basename(file.path)),
      originalName: file.originalname,
    };
  }

  return files;
}

export function formatSubmission(req, doc, { includeAdminNote = false } = {}) {
  const files = {};
  for (const [key, meta] of Object.entries(doc.files || {})) {
    if (meta?.path) {
      files[key] = {
        url: toPublicFileUrl(req, meta.path),
        originalName: meta.originalName,
      };
    }
  }

  const payload = {
    id: doc._id,
    userId: doc.userId,
    docType: doc.docType,
    status: doc.status,
    files,
    submittedAt: doc.createdAt,
    reviewedAt: doc.reviewedAt || null,
  };

  if (includeAdminNote || doc.status === 'rejected') {
    payload.adminNote = doc.adminNote || '';
  }

  if (doc.userId?.email || doc.userId?.mobile || doc.userId?.name) {
    payload.user = {
      id: doc.userId._id || doc.userId,
      email: doc.userId.email || null,
      mobile: doc.userId.mobile || null,
      name: doc.userId.name || '',
    };
  }

  return payload;
}
