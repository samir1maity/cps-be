import { type Response, type NextFunction } from 'express';
import ReturnRequestModel from '../models/ReturnRequest.js';
import OrderModel from '../models/Order.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import {
  createNotification,
  sendRefundUpdateEmail,
} from '../services/notificationService.js';
import { initiateRefund } from '../services/razorpayService.js';
import UserModel from '../models/User.js';
import logger from '../utils/logger.js';

export const createReturnRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { orderId, orderItemId, reason, description } = req.body;

    if (!orderId || !orderItemId || !reason) {
      throw new AppError('Order ID, order item ID, and reason are required', 400);
    }

    const order = await OrderModel.findOne({ _id: orderId, user: req.user!.sub });
    if (!order) throw new AppError('Order not found', 404);

    if (!['DELIVERED'].includes(order.status)) {
      throw new AppError('Return can only be requested for delivered orders', 400);
    }

    const item = order.items.find((i: any) => i._id.toString() === orderItemId);
    if (!item) throw new AppError('Order item not found', 404);

    // Check if return already requested for this item
    const existing = await ReturnRequestModel.findOne({ order: orderId, orderItem: orderItemId });
    if (existing) throw new AppError('Return request already submitted for this item', 409);

    const returnRequest = await ReturnRequestModel.create({
      order: orderId,
      user: req.user!.sub,
      orderItem: orderItemId,
      reason,
      description,
      refundAmount: item.price * item.quantity,
    });

    await createNotification(
      req.user!.sub,
      'ORDER',
      'Return Request Submitted',
      `Your return request for order #${orderId} has been submitted and is pending review.`,
      { orderId, returnRequestId: returnRequest._id.toString() }
    );

    res.status(201).json({ success: true, data: returnRequest });
  } catch (error) {
    next(error);
  }
};

export const getUserReturnRequests = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requests = await ReturnRequestModel.find({ user: req.user!.sub })
      .populate('order', 'items status total createdAt')
      .sort('-createdAt');

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

export const getReturnRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const request = await ReturnRequestModel.findOne({
      _id: req.params.id,
      user: req.user!.sub,
    }).populate('order');

    if (!request) throw new AppError('Return request not found', 404);
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};

// Admin: approve/reject return request
export const processReturnRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, adminNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new AppError('Status must be APPROVED or REJECTED', 400);
    }

    const returnRequest = await ReturnRequestModel.findById(req.params.id);
    if (!returnRequest) throw new AppError('Return request not found', 404);
    if (returnRequest.status !== 'PENDING') throw new AppError('Return request already processed', 400);

    returnRequest.status = status;
    returnRequest.adminNote = adminNote;
    returnRequest.processedAt = new Date();

    if (status === 'APPROVED') {
      returnRequest.refundStatus = 'INITIATED';
      returnRequest.status = 'REFUND_INITIATED';

      // Attempt Razorpay refund
      const order = await OrderModel.findById(returnRequest.order);
      if (order?.razorpayPaymentId && returnRequest.refundAmount) {
        try {
          const refund = await initiateRefund(
            order.razorpayPaymentId,
            Math.round(returnRequest.refundAmount * 100),
            { returnRequestId: returnRequest._id.toString() }
          );
          returnRequest.razorpayRefundId = refund.id as string;
          returnRequest.refundStatus = 'COMPLETED';
          returnRequest.status = 'REFUND_COMPLETED';

          // Update order payment status
          await OrderModel.findByIdAndUpdate(returnRequest.order, {
            paymentStatus: 'REFUNDED',
            status: 'REFUNDED',
          });

          logger.info('Refund processed', { returnRequestId: returnRequest._id, refundId: refund.id });
        } catch (refundError) {
          returnRequest.refundStatus = 'FAILED';
          returnRequest.status = 'REFUND_FAILED';
          logger.error('Refund failed', { returnRequestId: returnRequest._id, error: refundError });
        }
      }
    }

    await returnRequest.save();

    // Notify user
    const user = await UserModel.findById(returnRequest.user);
    if (user && returnRequest.refundAmount) {
      const notifMsg = status === 'APPROVED'
        ? `Your return request has been approved. Refund of ₹${returnRequest.refundAmount} is being processed.`
        : `Your return request has been rejected. ${adminNote || ''}`;

      await createNotification(
        returnRequest.user.toString(),
        'REFUND',
        `Return Request ${status}`,
        notifMsg,
        { returnRequestId: returnRequest._id.toString() }
      );

      if (status === 'APPROVED') {
        await sendRefundUpdateEmail(
          user.email,
          user.name,
          returnRequest.order.toString(),
          returnRequest.refundAmount,
          returnRequest.refundStatus
        );
      }
    }

    res.json({ success: true, data: returnRequest });
  } catch (error) {
    next(error);
  }
};
