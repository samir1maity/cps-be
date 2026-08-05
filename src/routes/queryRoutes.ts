import { Router } from 'express';
import { submitQuery, getPublicReviews, getAllPublicReviews } from '../controllers/queryController.js';

const router = Router();

// Public — no auth required
router.get('/reviews', getPublicReviews);
router.get('/reviews/all', getAllPublicReviews);
router.post('/', submitQuery);

export default router;
