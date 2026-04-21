import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  login,
  signup,
  refreshAccessToken,
  getMe,
  logout,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
} from '../controllers/authController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many reset requests, please try again later' },
});

const passwordResetVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/forgot-password', passwordResetRequestLimiter, requestPasswordResetOtp);
router.post('/reset-password', passwordResetVerifyLimiter, resetPasswordWithOtp);
router.post('/refresh', refreshAccessToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;
