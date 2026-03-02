import { Router } from 'express';
import { getProductReviews, createReview } from '../controllers/reviewController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.get('/product/:productId', getProductReviews);
router.post('/', authenticate, createReview);

export default router;
