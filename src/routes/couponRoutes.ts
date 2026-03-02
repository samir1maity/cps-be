import { Router } from 'express';
import { validateCoupon } from '../controllers/couponController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.post('/validate', authenticate, validateCoupon);

export default router;
