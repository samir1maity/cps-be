import { type Response, type NextFunction } from 'express';
import WishlistModel from '../models/Wishlist.js';
import ProductModel from '../models/Product.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

export const getWishlist = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const wishlist = await WishlistModel.findOne({ user: req.user!.sub })
      .populate({
        path: 'products',
        match: { isActive: true },
        populate: [
          { path: 'category', select: 'id name slug' },
          { path: 'subcategory', select: 'id name slug' },
        ],
      });

    const products = wishlist?.products || [];
    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

export const addToWishlist = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = req.body;
    if (!productId) throw new AppError('Product ID is required', 400);

    const product = await ProductModel.findOne({ _id: productId, isActive: true });
    if (!product) throw new AppError('Product not found', 404);

    await WishlistModel.findOneAndUpdate(
      { user: req.user!.sub },
      { $addToSet: { products: productId } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    next(error);
  }
};

export const removeFromWishlist = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await WishlistModel.findOneAndUpdate(
      { user: req.user!.sub },
      { $pull: { products: req.params.productId } }
    );
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    next(error);
  }
};
