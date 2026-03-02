import { Router } from 'express';
import { createOrder, verifyPayment, getOrders, getOrder, cancelOrder } from '../controllers/orderController.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.use(authenticate);

router.post('/', createOrder);
router.post('/verify-payment', verifyPayment);
router.get('/', getOrders);
router.get('/:id', getOrder);
router.patch('/:id/cancel', cancelOrder);

export default router;
