import { Router } from 'express';
import * as o from '../controllers/orderController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { orderSchema } from '../validators/schemas.js';

const r = Router();

r.use(requireAuth);

r.post('/', validateBody(orderSchema), o.createOrder);
r.get('/', o.listOrders);
r.get('/trades', o.listTrades);

export default r;
