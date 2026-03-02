import { Router } from 'express';
import { createReturnRequest, getUserReturnRequests, getReturnRequest, processReturnRequest } from '../controllers/returnController.js';
import { authenticate, requireAdmin } from '../middlewares/authenticate.js';

const router = Router();

router.use(authenticate);

router.post('/', createReturnRequest);
router.get('/', getUserReturnRequests);
router.get('/:id', getReturnRequest);
router.patch('/:id/process', requireAdmin, processReturnRequest);

export default router;
