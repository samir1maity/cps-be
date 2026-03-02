import { Router } from 'express';
import { getProducts, getProduct, createProduct, updateProduct, deleteProduct, upload } from '../controllers/productController.js';
import { authenticate, requireAdmin } from '../middlewares/authenticate.js';

const router = Router();

router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', authenticate, requireAdmin, upload.array('images', 10), createProduct);
router.put('/:id', authenticate, requireAdmin, upload.array('images', 10), updateProduct);
router.delete('/:id', authenticate, requireAdmin, deleteProduct);

export default router;
