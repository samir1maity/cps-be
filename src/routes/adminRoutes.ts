import { Router } from 'express';
import {
  getDashboardStats,
  getAdminOrders,
  updateOrderStatus,
  addOrderStatusUpdate,
  getAdminUsers,
  toggleUserBlock,
  getAdminReturnRequests,
  createCoupon,
  getCoupons,
  updateCoupon,
  getPaymentLogs,
} from '../controllers/adminController.js';
import { getQueries, updateQueryStatus } from '../controllers/queryController.js';
import {
  getAdminNotifications,
  getAdminUnreadCount,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '../controllers/adminNotificationController.js';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  createCategoryRules,
  updateCategoryRules,
} from '../controllers/adminCategoryController.js';
import { authenticate, requireAdmin } from '../middlewares/authenticate.js';

const router = Router();

router.use(authenticate, requireAdmin);

// Dashboard
router.get('/stats', getDashboardStats);

// Orders
router.get('/orders', getAdminOrders);
router.patch('/orders/:id/status', updateOrderStatus);
router.post('/orders/:id/status-updates', addOrderStatusUpdate);
router.get('/payment-logs', getPaymentLogs);

// Users
router.get('/users', getAdminUsers);
router.patch('/users/:id/toggle-block', toggleUserBlock);

// Return requests
router.get('/returns', getAdminReturnRequests);

// Categories & Subcategories — imageKey arrives as a plain JSON string in body,
// uploaded directly from browser to S3 via pre-signed PUT URL.
router.get('/categories', listCategories);
router.patch('/categories/reorder', reorderCategories);
router.get('/categories/:id', getCategory);
router.post('/categories', createCategoryRules, createCategory);
router.put('/categories/:id', updateCategoryRules, updateCategory);
router.delete('/categories/:id', deleteCategory);

// Coupons
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);

// Queries / Feedback
router.get('/queries', getQueries);
router.patch('/queries/:id/status', updateQueryStatus);

// Admin notifications
router.get('/notifications', getAdminNotifications);
router.get('/notifications/unread-count', getAdminUnreadCount);
router.patch('/notifications/read-all', markAllAdminNotificationsRead);
router.patch('/notifications/:id/read', markAdminNotificationRead);

export default router;
