import { Router } from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import {
  getVariantImages,
  saveVariantImages,
} from '../controllers/colorVariantImagesController.js';
import { authenticate, requireAdmin } from '../middlewares/authenticate.js';

const router = Router();

router.get('/', getProducts);
router.get('/:id', getProduct);
router.get('/:id/variant-images', getVariantImages);
router.post('/', authenticate, requireAdmin, createProduct);
router.put('/:id', authenticate, requireAdmin, updateProduct);
router.put('/:id/variant-images', authenticate, requireAdmin, saveVariantImages);
router.delete('/:id', authenticate, requireAdmin, deleteProduct);

export default router;
