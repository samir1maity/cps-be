import { type Request, type Response, type NextFunction } from 'express';
import ReviewModel from '../models/Review.js';
import ProductModel from '../models/Product.js';
import OrderModel from '../models/Order.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

const updateProductRating = async (productId: string) => {
  const reviews = await ReviewModel.find({ product: productId });
  if (reviews.length === 0) {
    await ProductModel.findByIdAndUpdate(productId, { rating: 0, reviewCount: 0 });
    return;
  }
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await ProductModel.findByIdAndUpdate(productId, {
    rating: Math.round(avg * 10) / 10,
    reviewCount: reviews.length,
  });
};

export const getProductReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(20, parseInt(limit));

    const [reviews, total] = await Promise.all([
      ReviewModel.find({ product: req.params.productId })
        .populate('user', 'name avatar')
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      ReviewModel.countDocuments({ product: req.params.productId }),
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

export const createReview = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId, orderId, rating, title, comment } = req.body;

    if (!productId || !orderId || !rating || !comment) {
      throw new AppError('Product ID, order ID, rating, and comment are required', 400);
    }

    // Verify order belongs to user and contains product
    const order = await OrderModel.findOne({
      _id: orderId,
      user: req.user!.sub,
      status: 'DELIVERED',
    });

    if (!order) throw new AppError('Order not found or not delivered yet', 400);

    const hasProduct = order.items.some((item: any) => item.product.toString() === productId);
    if (!hasProduct) throw new AppError('Product not found in this order', 400);

    // Check existing review
    const existing = await ReviewModel.findOne({ user: req.user!.sub, product: productId });
    if (existing) throw new AppError('You have already reviewed this product', 409);

    const review = await ReviewModel.create({
      user: req.user!.sub,
      product: productId,
      order: orderId,
      rating: Math.min(5, Math.max(1, parseInt(rating))),
      title,
      comment,
      isVerified: true,
    });

    await updateProductRating(productId);

    const populated = await review.populate('user', 'name avatar');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};
