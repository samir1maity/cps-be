import crypto from 'crypto';
import mongoose, {
  type ClientSession,
  type HydratedDocument,
} from 'mongoose';
import { type Request, type Response, type NextFunction } from 'express';
import OrderModel, { type Order } from '../models/Order.js';
import AddressModel from '../models/Address.js';
import CartModel from '../models/Cart.js';
import ProductModel from '../models/Product.js';
import CouponModel from '../models/Coupon.js';
import PaymentWebhookEventModel from '../models/PaymentWebhookEvent.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import {
  createRazorpayOrder,
  getPayment,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from '../services/razorpayService.js';
import { recordAuditLog } from '../services/paymentAuditService.js';
import {
  createNotification,
  sendOrderConfirmationEmail,
} from '../services/notificationService.js';
import UserModel from '../models/User.js';
import logger from '../utils/logger.js';

const TAX_RATE = 0.18;
const PAYMENT_METHODS = ['RAZORPAY', 'CASH_ON_DELIVERY'] as const;
const WEBHOOK_EVENT_RETENTION_DAYS = 45;
const WEBHOOK_PROCESSING_STALE_MS = 5 * 60 * 1000;

type OrderDocument = HydratedDocument<Order>;

interface RazorpayPaymentDetails {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  error_code?: string;
  error_description?: string;
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: RazorpayPaymentDetails;
    };
  };
}

const toPaise = (amount: number): number => Math.round(amount * 100);

const buildRazorpayReceipt = (userId: string): string =>
  `ord_${userId.slice(-6)}_${Date.now()}`.slice(0, 40);

const buildWebhookEventId = (rawBody: Buffer, headerValue?: string): string => {
  if (headerValue?.trim()) {
    return headerValue.trim();
  }

  return crypto.createHash('sha256').update(rawBody).digest('hex');
};

const getWebhookExpiryDate = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + WEBHOOK_EVENT_RETENTION_DAYS);
  return expiresAt;
};

const runInTransaction = async <T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> => {
  const session = await mongoose.startSession();

  try {
    let result!: T;

    await session.withTransaction(async () => {
      result = await operation(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const reserveInventory = async (
  items: Array<{ product: unknown; quantity: number }>,
  session?: ClientSession
): Promise<void> => {
  for (const item of items) {
    const stockReservation = await ProductModel.updateOne(
      {
        _id: item.product,
        isActive: true,
        stockQuantity: { $gte: item.quantity },
      },
      [
        { $set: { stockQuantity: { $subtract: ['$stockQuantity', item.quantity] } } },
        { $set: { inStock: { $gt: ['$stockQuantity', 0] } } },
      ],
      { session }
    );

    if (stockReservation.modifiedCount !== 1) {
      throw new AppError('One or more items are out of stock', 409);
    }
  }
};

const releaseInventory = async (
  items: Array<{ product: unknown; quantity: number }>,
  session?: ClientSession
): Promise<void> => {
  for (const item of items) {
    await ProductModel.updateOne(
      { _id: item.product },
      [
        { $set: { stockQuantity: { $add: ['$stockQuantity', item.quantity] } } },
        { $set: { inStock: { $gt: ['$stockQuantity', 0] } } },
      ],
      { session }
    );
  }
};

const clearUserCart = async (userId: string, session?: ClientSession): Promise<void> => {
  await CartModel.findOneAndUpdate({ user: userId }, { items: [] }, { session });
};

const consumeCouponUsage = async (
  couponCode: string | undefined,
  session: ClientSession
): Promise<void> => {
  if (!couponCode) {
    return;
  }

  await CouponModel.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } }, { session });
};

const dispatchPaymentSuccessEffects = async (order: {
  id: string;
  userId: string;
  total: number;
}): Promise<void> => {
  const user = await UserModel.findById(order.userId);
  if (!user) {
    return;
  }

  await sendOrderConfirmationEmail(user.email, user.name, order.id, order.total);
  await createNotification(
    user._id.toString(),
    'PAYMENT',
    'Payment Successful',
    `Payment for order #${order.id} was successful.`,
    { orderId: order.id }
  );
};

const createCodOrderTransaction = async (
  userId: string,
  resolvedAddressId: string,
  orderData: {
    items: Array<{ product: unknown; name: string; image: string; colorName: string | null; quantity: number; price: number }>;
    subtotal: number;
    tax: number;
    shipping: number;
    discount: number;
    total: number;
    couponCode?: string;
  }
): Promise<OrderDocument> =>
  runInTransaction(async (session) => {
    const [order] = await OrderModel.create([{
      user: userId,
      items: orderData.items,
      status: 'CONFIRMED',
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      shipping: orderData.shipping,
      discount: orderData.discount,
      total: orderData.total,
      shippingAddress: resolvedAddressId,
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      couponCode: orderData.couponCode,
    }], { session });

    await reserveInventory(order.items, session);
    await clearUserCart(userId, session);
    await consumeCouponUsage(order.couponCode ?? undefined, session);
    await recordAuditLog({
      scope: 'ORDER',
      event: 'ORDER_CREATED_COD',
      message: 'COD order created',
      orderId: order._id.toString(),
      userId,
      meta: { total: order.total, itemCount: order.items.length },
      session,
    });

    return order;
  });

const finalizeCapturedPayment = async (
  orderId: string,
  razorpayPaymentId: string,
  source: 'client' | 'webhook'
): Promise<{ order: OrderDocument; wasAlreadyPaid: boolean }> =>
  runInTransaction(async (session) => {
    const order = await OrderModel.findById(orderId).session(session);
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (order.paymentMethod !== 'RAZORPAY') {
      throw new AppError('Order is not a Razorpay order', 400);
    }

    if (order.paymentStatus === 'PAID') {
      return { order, wasAlreadyPaid: true };
    }

    if (order.paymentStatus === 'REFUNDED') {
      throw new AppError('Order payment was already refunded', 409);
    }

    order.paymentStatus = 'PAID';
    order.status = 'CONFIRMED';
    order.razorpayPaymentId = razorpayPaymentId;
    order.paymentFailureReason = undefined;
    await order.save({ session });

    await reserveInventory(order.items, session);
    await clearUserCart(order.user.toString(), session);
    await consumeCouponUsage(order.couponCode ?? undefined, session);
    await recordAuditLog({
      scope: 'PAYMENT',
      event: source === 'webhook' ? 'PAYMENT_CAPTURED_WEBHOOK' : 'PAYMENT_VERIFIED',
      message: source === 'webhook' ? 'Payment captured via Razorpay webhook' : 'Payment verified successfully',
      orderId: order._id.toString(),
      userId: order.user.toString(),
      paymentId: razorpayPaymentId,
      razorpayOrderId: order.razorpayOrderId ?? undefined,
      meta: { amount: order.total, status: order.status, source },
      session,
    });

    return { order, wasAlreadyPaid: false };
  });

const markPaymentFailed = async (
  orderId: string,
  paymentId: string | undefined,
  reason?: string
): Promise<OrderDocument | null> =>
  runInTransaction(async (session) => {
    const order = await OrderModel.findById(orderId).session(session);
    if (!order) {
      return null;
    }

    if (order.paymentMethod !== 'RAZORPAY' || order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') {
      return order;
    }

    order.paymentStatus = 'FAILED';
    order.status = 'CANCELLED';
    order.paymentFailureReason = reason?.slice(0, 200);
    if (paymentId) {
      order.razorpayPaymentId = paymentId;
    }
    await order.save({ session });

    await recordAuditLog({
      scope: 'PAYMENT',
      event: 'PAYMENT_FAILED_WEBHOOK',
      level: 'WARN',
      message: 'Payment failed as reported by Razorpay webhook',
      orderId: order._id.toString(),
      userId: order.user.toString(),
      paymentId,
      razorpayOrderId: order.razorpayOrderId ?? undefined,
      meta: { reason: reason ?? 'unknown' },
      session,
    });

    return order;
  });

const claimWebhookEvent = async (
  eventId: string,
  event: string,
  orderId?: string,
  paymentId?: string
): Promise<'PROCESS' | 'DUPLICATE' | 'IN_PROGRESS'> => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - WEBHOOK_PROCESSING_STALE_MS);

  try {
    await PaymentWebhookEventModel.create({
      eventId,
      event,
      status: 'PROCESSING',
      order: orderId,
      paymentId,
      processedAt: now,
      expiresAt: getWebhookExpiryDate(),
    });
    return 'PROCESS';
  } catch (error: any) {
    if (error?.code !== 11000) {
      throw error;
    }

    const existing = await PaymentWebhookEventModel.findOne({ eventId });
    if (!existing) {
      return 'PROCESS';
    }

    if (existing.status === 'COMPLETED') {
      return 'DUPLICATE';
    }

    if (existing.status === 'FAILED') {
      await PaymentWebhookEventModel.updateOne(
        { eventId, status: 'FAILED' },
        {
          $set: {
            status: 'PROCESSING',
            event,
            order: orderId,
            paymentId,
            processedAt: now,
            lastError: undefined,
          },
        }
      );
      return 'PROCESS';
    }

    if (existing.processedAt < staleBefore) {
      await PaymentWebhookEventModel.updateOne(
        { eventId, status: 'PROCESSING', processedAt: existing.processedAt },
        {
          $set: {
            event,
            order: orderId,
            paymentId,
            processedAt: now,
          },
        }
      );
      return 'PROCESS';
    }

    return 'IN_PROGRESS';
  }
};

const completeWebhookEvent = async (eventId: string): Promise<void> => {
  await PaymentWebhookEventModel.updateOne(
    { eventId },
    { $set: { status: 'COMPLETED', completedAt: new Date(), lastError: undefined } }
  );
};

const failWebhookEvent = async (eventId: string, error: unknown): Promise<void> => {
  const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
  await PaymentWebhookEventModel.updateOne(
    { eventId },
    { $set: { status: 'FAILED', lastError: message.slice(0, 200) } }
  );
};

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
    isDefault: false,
  });

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
    const normalizedPaymentMethod = String(paymentMethod).toUpperCase();

    if (!PAYMENT_METHODS.includes(normalizedPaymentMethod as typeof PAYMENT_METHODS[number])) {
      throw new AppError('Unsupported payment method', 400);
    }

    const resolvedAddressId = await resolveShippingAddress(userId, addressId, shippingAddress, saveAddress);
    const cart = await CartModel.findOne({ user: userId }).populate({
      path: 'items.product',
      match: { isActive: true },
    });
    if (!cart || cart.items.length === 0) throw new AppError('Cart is empty', 400);

    const activeItems = (cart.items as any[]).filter((i) => i.product != null);
    if (activeItems.length === 0) throw new AppError('All cart items are unavailable', 400);

    const orderItems: Array<{ product: unknown; name: string; image: string; colorName: string | null; quantity: number; price: number }> = [];
    let subtotal = 0;

    for (const item of activeItems) {
      const product = item.product;
      if (product.stockQuantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }

      const matchedColor = item.colorId
        ? product.colors?.find((c: any) => String(c._id) === String(item.colorId))
        : undefined;

      orderItems.push({
        product: product._id,
        name: product.name,
        image: matchedColor?.imageKey || product.images[0] || '',
        colorName: matchedColor?.name ?? null,
        quantity: item.quantity,
        price: product.price,
      });
      subtotal += product.price * item.quantity;
    }

    let discount = 0;
    let appliedCoupon: string | undefined;
    if (couponCode) {
      const now = new Date();
      const coupon = await CouponModel.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon && coupon.validFrom <= now && coupon.validUntil > now && subtotal >= (coupon.minOrderAmount || 0)) {
        if (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) {
          discount = coupon.type === 'PERCENTAGE'
            ? Math.min(subtotal * (coupon.value / 100), coupon.maxDiscountAmount || Infinity)
            : coupon.value;
          appliedCoupon = coupon.code;
        }
      }
    }

    const tax = (subtotal - discount) * TAX_RATE;
    const shipping = 0;
    const total = subtotal - discount + tax + shipping;

    if (normalizedPaymentMethod === 'CASH_ON_DELIVERY') {
      const order = await createCodOrderTransaction(userId, resolvedAddressId, {
        items: orderItems,
        subtotal,
        tax,
        shipping,
        discount,
        total,
        couponCode: appliedCoupon,
      });

      const user = await UserModel.findById(userId);
      if (user) {
        await sendOrderConfirmationEmail(user.email, user.name, order._id.toString(), total);
        await createNotification(
          userId,
          'ORDER',
          'Order Confirmed',
          `Your order #${order._id} has been placed successfully.`,
          { orderId: order._id.toString() }
        );
      }

      logger.info('Order created (COD)', { orderId: order._id, userId });
      const populated = await order.populate('shippingAddress');
      res.status(201).json({ success: true, data: populated });
      return;
    }

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
      couponCode: appliedCoupon,
    });

    const amountInPaise = toPaise(total);

    try {
      const razorpayOrder = await createRazorpayOrder({
        amount: amountInPaise,
        currency: 'INR',
        receipt: buildRazorpayReceipt(userId),
        notes: { userId, paymentFor: 'order' },
      });

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      await recordAuditLog({
        scope: 'PAYMENT',
        event: 'RAZORPAY_ORDER_CREATED',
        message: 'Razorpay order created for checkout',
        orderId: order._id.toString(),
        userId,
        razorpayOrderId: razorpayOrder.id,
        meta: { amountInPaise, currency: 'INR' },
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
      return;
    } catch (error) {
      await OrderModel.deleteOne({ _id: order._id });
      throw error;
    }
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

    const order = await OrderModel.findOne({ _id: orderId, user: req.user!.sub });
    if (!order) throw new AppError('Order not found', 404);

    if (order.paymentMethod !== 'RAZORPAY') {
      throw new AppError('Order is not a Razorpay order', 400);
    }

    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpayOrderId) {
      await recordAuditLog({
        scope: 'PAYMENT',
        event: 'PAYMENT_VERIFICATION_REJECTED',
        level: 'WARN',
        message: 'Razorpay order id mismatch during verification',
        orderId: order._id.toString(),
        userId: req.user!.sub,
        paymentId: razorpayPaymentId,
        razorpayOrderId,
      });
      throw new AppError('Payment verification failed', 400);
    }

    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      await recordAuditLog({
        scope: 'PAYMENT',
        event: 'PAYMENT_SIGNATURE_INVALID',
        level: 'WARN',
        message: 'Razorpay signature verification failed',
        orderId: order._id.toString(),
        userId: req.user!.sub,
        paymentId: razorpayPaymentId,
        razorpayOrderId,
      });
      throw new AppError('Payment verification failed', 400);
    }

    const payment = await getPayment(razorpayPaymentId) as RazorpayPaymentDetails;
    if (
      payment.order_id !== razorpayOrderId ||
      payment.status !== 'captured' ||
      payment.amount !== toPaise(order.total)
    ) {
      await recordAuditLog({
        scope: 'PAYMENT',
        event: 'PAYMENT_PROVIDER_STATE_INVALID',
        level: 'WARN',
        message: 'Provider payment state did not match expected captured state',
        orderId: order._id.toString(),
        userId: req.user!.sub,
        paymentId: razorpayPaymentId,
        razorpayOrderId,
        meta: {
          providerStatus: payment.status,
          providerAmount: payment.amount,
          expectedAmount: toPaise(order.total),
        },
      });
      throw new AppError('Payment is not captured yet', 409);
    }

    const result = await finalizeCapturedPayment(order._id.toString(), razorpayPaymentId, 'client');
    if (!result.wasAlreadyPaid) {
      await dispatchPaymentSuccessEffects({
        id: result.order._id.toString(),
        userId: result.order.user.toString(),
        total: result.order.total,
      });
    }

    logger.info('Payment verified', { orderId, razorpayPaymentId });

    const populated = await result.order.populate('shippingAddress');
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

export const handleRazorpayWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string' || !signature) {
      throw new AppError('Missing Razorpay webhook signature', 400);
    }

    if (!Buffer.isBuffer(req.body)) {
      throw new AppError('Invalid webhook payload', 400);
    }

    if (!verifyRazorpayWebhookSignature(req.body, signature)) {
      logger.warn('Invalid Razorpay webhook signature');
      throw new AppError('Invalid webhook signature', 401);
    }

    const payload = JSON.parse(req.body.toString('utf8')) as RazorpayWebhookPayload;
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id;
    const paymentId = payment?.id;

    if (!event || !razorpayOrderId) {
      res.json({ success: true, ignored: true });
      return;
    }

    const order = await OrderModel.findOne({ razorpayOrderId });
    if (!order) {
      logger.warn('Razorpay webhook order not found', { event, razorpayOrderId, paymentId });
      res.json({ success: true, ignored: true });
      return;
    }

    const webhookEventId = buildWebhookEventId(
      req.body,
      typeof req.headers['x-razorpay-event-id'] === 'string' ? req.headers['x-razorpay-event-id'] : undefined
    );
    const shouldProcessEvent = await claimWebhookEvent(
      webhookEventId,
      event,
      order._id.toString(),
      paymentId
    );

    if (shouldProcessEvent === 'DUPLICATE') {
      res.json({ success: true, duplicate: true });
      return;
    }

    if (shouldProcessEvent === 'IN_PROGRESS') {
      res.status(202).json({ success: true, inProgress: true });
      return;
    }

    try {
      switch (event) {
        case 'payment.authorized': {
          await recordAuditLog({
            scope: 'PAYMENT',
            event: 'PAYMENT_AUTHORIZED_WEBHOOK',
            message: 'Payment authorized, awaiting capture',
            orderId: order._id.toString(),
            userId: order.user.toString(),
            paymentId,
            razorpayOrderId,
            meta: { providerStatus: payment?.status ?? 'authorized' },
          });
          logger.info('Payment authorized via webhook', { orderId: order._id, paymentId, razorpayOrderId });
          break;
        }
        case 'payment.failed': {
          const failureReason = [payment?.error_code, payment?.error_description].filter(Boolean).join(': ');
          await markPaymentFailed(order._id.toString(), paymentId, failureReason);
          logger.warn('Payment failed via webhook', { orderId: order._id, paymentId, razorpayOrderId, failureReason });
          break;
        }
        case 'payment.captured': {
          if (!paymentId || payment.status !== 'captured' || payment.amount !== toPaise(order.total)) {
            await recordAuditLog({
              scope: 'PAYMENT',
              event: 'PAYMENT_CAPTURE_WEBHOOK_MISMATCH',
              level: 'ERROR',
              message: 'Captured webhook did not match expected payment state',
              orderId: order._id.toString(),
              userId: order.user.toString(),
              paymentId,
              razorpayOrderId,
              meta: {
                providerStatus: payment?.status,
                providerAmount: payment?.amount,
                expectedAmount: toPaise(order.total),
              },
            });
            throw new AppError('Invalid captured payment payload', 400);
          }

          const result = await finalizeCapturedPayment(order._id.toString(), paymentId, 'webhook');
          if (!result.wasAlreadyPaid) {
            await dispatchPaymentSuccessEffects({
              id: result.order._id.toString(),
              userId: result.order.user.toString(),
              total: result.order.total,
            });
          }

          logger.info('Payment captured via webhook', { orderId: order._id, paymentId, razorpayOrderId });
          break;
        }
        default: {
          logger.info('Ignored Razorpay webhook event', { event, razorpayOrderId, paymentId });
        }
      }

      await completeWebhookEvent(webhookEventId);
      res.json({ success: true });
    } catch (error) {
      await failWebhookEvent(webhookEventId, error);
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

export const getOrders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

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
    const query = req.user!.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, user: req.user!.sub };

    const order = await OrderModel.findOne(query)
      .populate('shippingAddress')
      .populate('user', 'name email phone');
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

    const shouldReleaseInventory = order.status === 'CONFIRMED';
    order.status = 'CANCELLED';
    if (order.paymentMethod === 'RAZORPAY' && order.paymentStatus === 'PENDING') {
      order.paymentStatus = 'FAILED';
      order.paymentFailureReason = 'Cancelled before successful payment capture';
    }
    await order.save();

    if (shouldReleaseInventory) {
      await releaseInventory(order.items);
    }

    await createNotification(
      req.user!.sub,
      'ORDER',
      'Order Cancelled',
      `Your order #${order._id} has been cancelled.`,
      { orderId: order._id.toString() }
    );
    await recordAuditLog({
      scope: 'ORDER',
      event: 'ORDER_CANCELLED',
      message: 'Order cancelled by customer',
      orderId: order._id.toString(),
      userId: req.user!.sub,
      paymentId: order.razorpayPaymentId ?? undefined,
      razorpayOrderId: order.razorpayOrderId ?? undefined,
      meta: { paymentStatus: order.paymentStatus },
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};
