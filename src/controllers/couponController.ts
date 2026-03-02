import { type Request, type Response, type NextFunction } from 'express';
import CouponModel from '../models/Coupon.js';
import { AppError } from '../middlewares/errorHandler.js';

export const validateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, orderAmount } = req.body;
    if (!code) throw new AppError('Coupon code is required', 400);

    const coupon = await CouponModel.findOne({ code: code.toUpperCase(), isActive: true });

    if (!coupon) throw new AppError('Invalid or expired coupon', 404);
    if (coupon.validUntil < new Date()) throw new AppError('Coupon has expired', 400);
    if (coupon.validFrom > new Date()) throw new AppError('Coupon is not yet valid', 400);
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError('Coupon usage limit reached', 400);
    }
    if (orderAmount && coupon.minOrderAmount && Number(orderAmount) < coupon.minOrderAmount) {
      throw new AppError(`Minimum order amount of ₹${coupon.minOrderAmount} required`, 400);
    }

    res.json({
      success: true,
      data: {
        id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount,
        validUntil: coupon.validUntil,
      },
    });
  } catch (error) {
    next(error);
  }
};
