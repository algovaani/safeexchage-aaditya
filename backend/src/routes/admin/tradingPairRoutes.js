import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import * as tp from '../../controllers/admin/tradingPairAdminController.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { coinLogoUpload } from '../../middleware/coinLogoUpload.js';
import { error } from '../../utils/response.js';

const r = Router();

function handleLogoUpload(req, res, next) {
  coinLogoUpload.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, 'Image too large. Maximum size is 2MB.', 400);
      }
      return error(res, err.message, 400);
    }
    if (err) {
      return error(res, err.message, 400);
    }
    return next();
  });
}

r.get('/coins/search', tp.searchCoinValidators, validateRequest, tp.searchCoinCatalog);
r.get('/coins/contract', tp.contractLookupValidators, validateRequest, tp.previewContract);
r.get('/coins/dex', tp.dexPreviewValidators, validateRequest, tp.previewDexPair);
r.get('/', tp.listPairs);
r.post('/:id/logo', tp.pairIdValidators, validateRequest, handleLogoUpload, tp.uploadPairLogo);
r.get('/:id', tp.pairIdValidators, validateRequest, tp.getPair);
r.post('/', tp.createPairValidators, validateRequest, tp.addPair);
r.patch('/:id', tp.updatePairValidators, validateRequest, tp.patchPair);
r.delete('/:id', tp.pairIdValidators, validateRequest, tp.removePair);

export default r;
