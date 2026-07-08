import { Router } from 'express';
import * as config from '../controllers/configController.js';

const r = Router();

r.get('/', config.getPublicConfig);

export default r;
