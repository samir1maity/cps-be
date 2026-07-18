import { Router } from 'express';
import { submitQuery } from '../controllers/queryController.js';

const router = Router();

// Public — no auth required
router.post('/', submitQuery);

export default router;
