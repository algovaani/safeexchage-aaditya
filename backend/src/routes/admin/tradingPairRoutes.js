import { Router } from 'express';
import * as tp from '../../controllers/admin/tradingPairAdminController.js';
import { validateRequest } from '../../middleware/validateRequest.js';

const r = Router();

r.get(
  '/coins/search',
  tp.searchCoinValidators,
  validateRequest,
  tp.searchCoinCatalog
);
r.get(
  '/coins/contract',
  tp.contractLookupValidators,
  validateRequest,
  tp.previewContract
);
r.get(
  '/coins/coingecko',
  tp.coingeckoPreviewValidators,
  validateRequest,
  tp.previewCoinGecko
);
r.get('/', tp.listPairs);
r.get('/:id', tp.pairIdValidators, validateRequest, tp.getPair);
r.post('/', tp.createPairValidators, validateRequest, tp.addPair);
r.patch('/:id', tp.updatePairValidators, validateRequest, tp.patchPair);
r.delete('/:id', tp.pairIdValidators, validateRequest, tp.removePair);

export default r;
