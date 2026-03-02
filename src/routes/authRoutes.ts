import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, signup, refreshAccessToken, getMe, logout } from '../controllers/authController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' },
});

router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;
