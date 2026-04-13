import { type Response, type NextFunction } from 'express';
import OrderModel from '../models/Order.js';
import AddressModel from '../models/Address.js';
import CartModel from '../models/Cart.js';
import ProductModel from '../models/Product.js';
import CouponModel from '../models/Coupon.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from '../services/razorpayService.js';
import {
  createNotification,
  sendOrderConfirmationEmail,
} from '../services/notificationService.js';
import UserModel from '../models/User.js';
import logger from '../utils/logger.js';

const TAX_RATE = 0.18;

/**
 * Resolve shipping address for an order.
 * If `addressId` is provided, reuse an existing saved address.
 * Otherwise create a new Address doc from the raw address fields.
 * Optionally save the new address to the user's saved addresses.
 */
async function resolveShippingAddress(
  userId: string,
  addressId?: string,
  rawAddress?: Record<string, string>,
  saveAddress?: boolean,
): Promise<string> {
  if (addressId) {
    const existing = await AddressModel.findOne({ _id: addressId, user: userId });
    if (!existing) throw new AppError('Saved address not found', 404);
    return existing._id.toString();
  }

  if (!rawAddress) throw new AppError('Shipping address is required', 400);

  const required = ['firstName', 'lastName', 'address1', 'city', 'state', 'zipCode', 'country', 'phone'];
  for (const field of required) {
    if (!rawAddress[field]) throw new AppError(`${field} is required in shipping address`, 400);
  }

  // If user wants to save this address, check for duplicates first
  if (saveAddress) {
    const duplicate = await AddressModel.findOne({
      user: userId,
      address1: rawAddress.address1,
      city: rawAddress.city,
      zipCode: rawAddress.zipCode,
    });
    if (duplicate) return duplicate._id.toString();
  }

  const addr = await AddressModel.create({
    user: userId,
    firstName: rawAddress.firstName,
    lastName: rawAddress.lastName,
    address1: rawAddress.address1,
    address2: rawAddress.address2,
    city: rawAddress.city,
    state: rawAddress.state,
    zipCode: rawAddress.zipCode,
    country: rawAddress.country,
    phone: rawAddress.phone,
    // Only persist to user's saved list if they opted in
    isDefault: false,
  });

  // If not saveAddress, we created a transient doc just for the order.
  // It's still a real doc so it can be populated; it just won't appear in the
  // user's address book unless they opted to save it.
  return addr._id.toString();
}

export const createOrder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      addressId,
      shippingAddress,
      saveAddress = false,
      paymentMethod = 'RAZORPAY',
      couponCode,
    } = req.body;

    const userId = req.user!.sub;

    const resolvedAddressId = await resolveShippingAddress(userId, addressId, shippingAddress, saveAddress);

    // Get cart
    const cart = await CartModel.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) throw new AppError('Cart is empty', 400);

    // Build order items and validate stock
    const orderItems: any[] = [];
    let subtotal = 0;

    for (const item of cart.items as any[]) {
      const product = await ProductModel.findById(item.product._id);
      if (!product || !product.isActive) throw new AppError(`Product ${item.product.name} is no longer available`, 400);
      if (product.stockQuantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images[0] || '',
        quantity: item.quantity,
        price: product.price,
      });
      subtotal += product.price * item.quantity;
    }

    // Apply coupon
    let discount = 0;
    let appliedCoupon: string | undefined;
    if (couponCode) {
      const coupon = await CouponModel.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon && coupon.validUntil > new Date() && subtotal >= (coupon.minOrderAmount || 0)) {
        if (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) {
          discount = coupon.type === 'PERCENTAGE'
            ? Math.min(subtotal * (coupon.value / 100), coupon.maxDiscountAmount || Infinity)
            : coupon.value;
          appliedCoupon = coupon.code;
          await CouponModel.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
        }
      }
    }

    const tax = (subtotal - discount) * TAX_RATE;
    const shipping = 0;
    const total = subtotal - discount + tax + shipping;

    if (paymentMethod === 'CASH_ON_DELIVERY') {
      const order = await OrderModel.create({
        user: userId,
        items: orderItems,
        status: 'CONFIRMED',
        subtotal,
        tax,
        shipping,
        discount,
        total,
        shippingAddress: resolvedAddressId,
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        couponCode: appliedCoupon,
      });

      for (const item of cart.items as any[]) {
        await ProductModel.findByIdAndUpdate(item.product._id, { $inc: { stockQuantity: -item.quantity } });
      }
      await CartModel.findOneAndUpdate({ user: userId }, { items: [] });

      const user = await UserModel.findById(userId);
      if (user) {
        await sendOrderConfirmationEmail(user.email, user.name, order._id.toString(), total);
        await createNotification(userId, 'ORDER', 'Order Confirmed', `Your order #${order._id} has been placed successfully.`, { orderId: order._id.toString() });
      }

      logger.info('Order created (COD)', { orderId: order._id, userId });
      const populated = await order.populate('shippingAddress');
      res.status(201).json({ success: true, data: populated });
      return;
    }

    // Razorpay
    const amountInPaise = Math.round(total * 100);
    const razorpayOrder = await createRazorpayOrder({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: { userId },
    });

    const order = await OrderModel.create({
      user: userId,
      items: orderItems,
      status: 'PENDING',
      subtotal,
      tax,
      shipping,
      discount,
      total,
      shippingAddress: resolvedAddressId,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PENDING',
      razorpayOrderId: razorpayOrder.id,
      couponCode: appliedCoupon,
    });

    res.status(201).json({
      success: true,
      data: {
        order,
        razorpayOrderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyPayment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

    if (!orderId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      throw new AppError('Missing payment verification parameters', 400);
    }

    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      logger.warn('Payment signature verification failed', { orderId, razorpayPaymentId });
      throw new AppError('Payment verification failed', 400);
    }

    const order = await OrderModel.findOne({ _id: orderId, user: req.user!.sub });
    if (!order) throw new AppError('Order not found', 404);

    order.paymentStatus = 'PAID';
    order.status = 'CONFIRMED';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    await order.save();

    for (const item of order.items) {
      await ProductModel.findByIdAndUpdate(item.product, { $inc: { stockQuantity: -item.quantity } });
    }
    await CartModel.findOneAndUpdate({ user: req.user!.sub }, { items: [] });

    const user = await UserModel.findById(req.user!.sub);
    if (user) {
      await sendOrderConfirmationEmail(user.email, user.name, order._id.toString(), order.total);
      await createNotification(req.user!.sub, 'PAYMENT', 'Payment Successful', `Payment for order #${order._id} was successful.`, { orderId: order._id.toString() });
    }

    logger.info('Payment verified', { orderId, razorpayPaymentId });

    const populated = await order.populate('shippingAddress');
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

export const getOrders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit));

    const [orders, total] = await Promise.all([
      OrderModel.find({ user: req.user!.sub })
        .populate('shippingAddress')
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      OrderModel.countDocuments({ user: req.user!.sub }),
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

export const getOrder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await OrderModel.findOne({ _id: req.params.id, user: req.user!.sub }).populate('shippingAddress');
    if (!order) throw new AppError('Order not found', 404);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await OrderModel.findOne({ _id: req.params.id, user: req.user!.sub });
    if (!order) throw new AppError('Order not found', 404);

    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw new AppError('Order cannot be cancelled at this stage', 400);
    }

    order.status = 'CANCELLED';
    await order.save();

    for (const item of order.items) {
      await ProductModel.findByIdAndUpdate(item.product, { $inc: { stockQuantity: item.quantity } });
    }

    await createNotification(req.user!.sub, 'ORDER', 'Order Cancelled', `Your order #${order._id} has been cancelled.`, { orderId: order._id.toString() });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};
