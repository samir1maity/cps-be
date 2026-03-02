import { type Request, type Response, type NextFunction } from 'express';
import UserModel from '../models/User.js';
import OrderModel from '../models/Order.js';
import ProductModel from '../models/Product.js';
import CategoryModel from '../models/Category.js';
import ReturnRequestModel from '../models/ReturnRequest.js';
import CouponModel from '../models/Coupon.js';
import { AppError } from '../middlewares/errorHandler.js';
// Category CRUD is handled by adminCategoryController
import type { AuthRequest } from '../middlewares/authenticate.js';
import {
  createNotification,
  sendShippingUpdateEmail,
} from '../services/notificationService.js';
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

    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate('user', 'name email phone')
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      OrderModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, trackingNumber } = req.body;
    const validStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) throw new AppError('Invalid status', 400);

    const order = await OrderModel.findById(req.params.id).populate('user', 'name email');
    if (!order) throw new AppError('Order not found', 404);

    order.status = status;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    await order.save();

    const user = order.user as any;
    if (status === 'SHIPPED' && trackingNumber && user?.email) {
      await sendShippingUpdateEmail(user.email, user.name, order._id.toString(), trackingNumber);
    }

    await createNotification(
      user._id.toString(),
      'ORDER',
      `Order ${status}`,
      `Your order #${order._id} status updated to ${status}.`,
      { orderId: order._id.toString() }
    );

    logger.info('Order status updated', { orderId: order._id, status });
    res.json({ success: true, data: order });
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
