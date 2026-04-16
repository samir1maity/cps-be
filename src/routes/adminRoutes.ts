import { Router } from 'express';
import {
  getDashboardStats,
  getAdminOrders,
  updateOrderStatus,
  getAdminUsers,
  toggleUserBlock,
  getAdminReturnRequests,
  createCoupon,
  getCoupons,
  updateCoupon,
} from '../controllers/adminController.js';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  createCategoryRules,
  updateCategoryRules,
  categoryImageUpload,
} from '../controllers/adminCategoryController.js';
import { authenticate, requireAdmin } from '../middlewares/authenticate.js';

const router = Router();

router.use(authenticate, requireAdmin);

// Dashboard
router.get('/stats', getDashboardStats);

// Orders
router.get('/orders', getAdminOrders);
router.patch('/orders/:id/status', updateOrderStatus);

// Users
router.get('/users', getAdminUsers);
router.patch('/users/:id/toggle-block', toggleUserBlock);

// Return requests
router.get('/returns', getAdminReturnRequests);

// Categories & Subcategories (full CRUD)
// categoryImageUpload.single('image') must come before validation so req.file is populated.
router.get('/categories', listCategories);
router.get('/categories/:id', getCategory);
router.post('/categories', categoryImageUpload.single('image'), createCategoryRules, createCategory);
router.put('/categories/:id', categoryImageUpload.single('image'), updateCategoryRules, updateCategory);
router.delete('/categories/:id', deleteCategory);

// Coupons
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);

export default router;
