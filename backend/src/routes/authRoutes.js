import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  forgotPasswordValidators,
  loginValidators,
  registerValidators,
  resetPasswordValidators,
} from '../validators/authValidators.js';

const r = Router();

r.post('/register', registerValidators, validateRequest, auth.register);
r.post('/login', loginValidators, validateRequest, auth.login);
r.post('/forgot-password', forgotPasswordValidators, validateRequest, auth.forgotPassword);
r.post('/reset-password', resetPasswordValidators, validateRequest, auth.resetPassword);
r.post('/logout', authMiddleware, auth.logout);
r.get('/me', authMiddleware, auth.me);

export default r;
