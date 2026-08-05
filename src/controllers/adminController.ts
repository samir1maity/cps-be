import { type Request, type Response, type NextFunction } from 'express';
import UserModel from '../models/User.js';
import AdminModel from '../models/Admin.js';
import OrderModel from '../models/Order.js';
import { releaseInventory } from './orderController.js';
import ProductModel from '../models/Product.js';
import CategoryModel from '../models/Category.js';
import ReturnRequestModel from '../models/ReturnRequest.js';
import CouponModel from '../models/Coupon.js';
import PaymentAuditLogModel from '../models/PaymentAuditLog.js';
import { AppError } from '../middlewares/errorHandler.js';
// Category CRUD is handled by adminCategoryController
import type { AuthRequest } from '../middlewares/authenticate.js';
import {
  createNotification,
  sendOrderStatusEmail,
} from '../services/notificationService.js';
import { recordAuditLog } from '../services/paymentAuditService.js';
import logger from '../utils/logger.js';

// Dashboard Analytics
export const getDashboardStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [totalUsers, totalOrders, totalProducts, totalCategories] = await Promise.all([
      UserModel.countDocuments(),
      OrderModel.countDocuments(),
      ProductModel.countDocuments({ isActive: true }),
      CategoryModel.countDocuments({ isActive: true }),
    ]);

    const revenueResult = await OrderModel.aggregate([
      { $match: { paymentStatus: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // Orders by status
    const ordersByStatus = await OrderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Recent orders (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOrders = await OrderModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalOrders,
        totalProducts,
        totalCategories,
        totalRevenue,
        recentOrders,
        ordersByStatus: Object.fromEntries(ordersByStatus.map(s => [s._id, s.count])),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Orders management
export const getAdminOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '20', status } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));

    const filter: Record<string, any> = {};
    if (status) filter.status = status;

    // Fetch raw docs first (no populate) so we always have the user ObjectId,
    // then resolve User and Admin in parallel.
    const [rawOrders, total] = await Promise.all([
      OrderModel.find(filter).lean().sort('-createdAt').skip((pageNum - 1) * limitNum).limit(limitNum),
      OrderModel.countDocuments(filter),
    ]);

    const userIds = [...new Set(rawOrders.map((o) => String(o.user)))];

    const [users, admins] = await Promise.all([
      UserModel.find({ _id: { $in: userIds } }, 'name email phone').lean(),
      AdminModel.find({ _id: { $in: userIds } }, 'name email').lean(),
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), { id: String(u._id), name: u.name, email: u.email, phone: (u as any).phone }]));
    const adminMap = new Map(admins.map((a) => [String(a._id), { id: String(a._id), name: a.name, email: a.email }]));

    const enriched = rawOrders.map((order) => {
      const uid = String(order.user);
      const userDoc = userMap.get(uid);
      const adminDoc = adminMap.get(uid);
      return {
        ...order,
        id: String(order._id),
        user: userDoc ?? adminDoc ?? null,
        isAdminOrder: !userDoc && !!adminDoc,
      };
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, trackingNumber, statusMessage } = req.body;
    const validStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) throw new AppError('Invalid status', 400);

    const order = await OrderModel.findById(req.params.id).populate('user', 'name email');
    if (!order) throw new AppError('Order not found', 404);

    // Guard: cannot change status of a refunded order
    if (order.status === 'REFUNDED') {
      throw new AppError('Cannot update status of a refunded order', 400);
    }

    // Guard: no-op
    if (order.status === status) {
      res.json({ success: true, data: order });
      return;
    }

    const prevStatus = order.status;
    order.status = status;
    if (trackingNumber) order.trackingNumber = trackingNumber;

    // Admin cancellation: handle payment status and inventory
    if (status === 'CANCELLED') {
      // Mark Razorpay payment as FAILED if it was never captured
      if (order.paymentMethod === 'RAZORPAY' && order.paymentStatus === 'PENDING') {
        order.paymentStatus = 'FAILED';
        order.paymentFailureReason = 'Cancelled by admin';
      }
    }

    const defaultMessages: Record<string, string> = {
      CONFIRMED: 'Your order has been confirmed.',
      PROCESSING: 'Your order is being packed and prepared for shipment.',
      SHIPPED: 'Your order has been shipped and is on the way.',
      DELIVERED: 'Your order has been delivered successfully.',
      CANCELLED: 'Your order has been cancelled.',
    };
    order.messages.push({
      message: statusMessage?.trim() || defaultMessages[status] || `Order status updated to ${status}.`,
      timestamp: new Date(),
    } as any);

    await order.save();

    // Release inventory when cancelling a confirmed/in-progress order
    const inventoryHeld = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
    if (status === 'CANCELLED' && inventoryHeld.includes(prevStatus)) {
      await releaseInventory(order.items);
    }

    const user = order.user as any;

    // Send a status-specific email for every transition (fire-and-forget — never blocks the response)
    if (user?.email) {
      sendOrderStatusEmail({
        email: user.email,
        name: user.name,
        orderId: order._id.toString(),
        status: status as 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
        trackingNumber: trackingNumber || undefined,
        customMessage: statusMessage?.trim() || undefined,
        total: order.total,
      }).catch((err) => logger.error('Failed to send order status email', { err, orderId: order._id, status }));
    }

    await createNotification(
      user._id.toString(),
      'ORDER',
      `Order ${status}`,
      statusMessage?.trim() || `Your order #${order._id} status updated to ${status}.`,
      { orderId: order._id.toString() }
    );

    const actingAdmin = req.user?.sub
      ? await AdminModel.findById(req.user.sub, 'name').lean()
      : null;

    await recordAuditLog({
      scope: 'ORDER',
      event: 'ORDER_STATUS_UPDATED',
      message: 'Order status updated by admin',
      orderId: order._id.toString(),
      userId: user._id.toString(),
      paymentId: order.razorpayPaymentId ?? undefined,
      razorpayOrderId: order.razorpayOrderId ?? undefined,
      meta: { status, trackingNumber, updatedBy: actingAdmin?.name ?? 'Admin' },
    });
    logger.info('Order status updated', { orderId: order._id, status, prevStatus });
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const addOrderStatusUpdate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { message } = req.body;
    if (!message?.trim()) throw new AppError('Message is required', 400);

    const order = await OrderModel.findById(req.params.id).populate('user', 'name email');
    if (!order) throw new AppError('Order not found', 404);

    order.messages.push({
      message: message.trim(),
      timestamp: new Date(),
    } as any);

    await order.save();

    const user = order.user as any;
    await createNotification(
      user._id.toString(),
      'ORDER',
      'Order Update',
      message.trim(),
      { orderId: order._id.toString() }
    );

    logger.info('Order status update added', { orderId: order._id, message });
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const getPaymentLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '20',
      level,
      scope,
      orderId,
      paymentId,
      razorpayOrderId,
      search,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter: Record<string, unknown> = {};
    if (level) filter.level = level.toUpperCase();
    if (scope) filter.scope = scope.toUpperCase();
    if (orderId) filter.order = orderId;
    if (paymentId) filter.paymentId = paymentId;
    if (razorpayOrderId) filter.razorpayOrderId = razorpayOrderId;
    if (search) {
      filter.$or = [
        { event: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
        { paymentId: { $regex: search, $options: 'i' } },
        { razorpayOrderId: { $regex: search, $options: 'i' } },
      ];
    }

    const [logs, total] = await Promise.all([
      PaymentAuditLogModel.find(filter)
        .populate('order', '_id status paymentStatus total createdAt')
        .populate('user', 'name email')
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      PaymentAuditLogModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

// User management
export const getAdminUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '20', search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));

    const filter: Record<string, any> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select('-passwordHash')
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      UserModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

export const toggleUserBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      success: true,
      data: { id: user.id, isBlocked: user.isBlocked },
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// Return requests management
export const getAdminReturnRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '20', status } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));

    const filter: Record<string, any> = {};
    if (status) filter.status = status;

    const [requests, total] = await Promise.all([
      ReturnRequestModel.find(filter)
        .populate('user', 'name email')
        .populate('order', 'total status createdAt razorpayPaymentId')
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      ReturnRequestModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

// Coupon management
export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupon = await CouponModel.create(req.body);
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

export const getCoupons = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupons = await CouponModel.find().sort('-createdAt');
    res.json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};

export const updateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupon = await CouponModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) throw new AppError('Coupon not found', 404);
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};
