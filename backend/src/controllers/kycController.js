import { KycDetail } from '../models/KycDetail.js';

const DOC_TYPES = new Set(['aadhar', 'pan', 'passport']);

export async function upload(req, res, next) {
  try {
    const documentType = req.body?.documentType;
    if (!DOC_TYPES.has(documentType)) {
      return res.status(400).json({ error: 'documentType must be aadhar, pan, or passport' });
    }
    if (!req.file) return res.status(400).json({ error: 'File required' });

    const row = await KycDetail.create({
      userId: req.userId,
      documentType,
      filePath: req.file.path,
      originalName: req.file.originalname,
      status: 'pending',
    });

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function myStatus(req, res, next) {
  try {
    const items = await KycDetail.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) {
    next(e);
  }
}
