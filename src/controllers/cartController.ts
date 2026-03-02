import { type Response, type NextFunction } from 'express';
import CartModel from '../models/Cart.js';
import ProductModel from '../models/Product.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

const getCartWithProducts = async (userId: string) => {
  const cart = await CartModel.findOne({ user: userId })
    .populate({
      path: 'items.product',
      select: 'name price originalPrice images inStock stockQuantity brand',
      populate: [
        { path: 'category', select: 'id name slug' },
        { path: 'subcategory', select: 'id name slug' },
      ],
    });
  return cart;
};

export const getCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await getCartWithProducts(req.user!.sub);
    const items = cart?.items.map((item: any) => ({
      id: item._id,
      productId: item.product._id,
      product: item.product,
      quantity: item.quantity,
      userId: req.user!.sub,
    })) || [];

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

export const addToCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!productId) throw new AppError('Product ID is required', 400);

    const product = await ProductModel.findOne({ _id: productId, isActive: true });
    if (!product) throw new AppError('Product not found', 404);
    if (!product.inStock || product.stockQuantity < 1) throw new AppError('Product is out of stock', 400);

    const qty = Math.max(1, parseInt(quantity));
    if (qty > product.stockQuantity) throw new AppError(`Only ${product.stockQuantity} items available`, 400);

    let cart = await CartModel.findOne({ user: req.user!.sub });

    if (!cart) {
      cart = await CartModel.create({
        user: req.user!.sub,
        items: [{ product: productId, quantity: qty }],
      });
    } else {
      const existingItem = cart.items.find((i: any) => i.product.toString() === productId);
      if (existingItem) {
        existingItem.quantity = Math.min(existingItem.quantity + qty, product.stockQuantity);
      } else {
        cart.items.push({ product: productId, quantity: qty } as any);
      }
      await cart.save();
    }

    const populated = await getCartWithProducts(req.user!.sub);
    const items = populated?.items.map((item: any) => ({
      id: item._id,
      productId: item.product._id,
      product: item.product,
      quantity: item.quantity,
      userId: req.user!.sub,
    })) || [];

    res.status(201).json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

export const updateCartItem = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) throw new AppError('Valid quantity is required', 400);

    const cart = await CartModel.findOne({ user: req.user!.sub });
    if (!cart) throw new AppError('Cart not found', 404);

    const item = cart.items.find((i: any) => i._id.toString() === req.params.itemId);
    if (!item) throw new AppError('Cart item not found', 404);

    const product = await ProductModel.findById((item as any).product);
    if (!product) throw new AppError('Product not found', 404);

    const qty = parseInt(quantity);
    if (qty > product.stockQuantity) throw new AppError(`Only ${product.stockQuantity} items available`, 400);

    item.quantity = qty;
    await cart.save();

    const populated = await getCartWithProducts(req.user!.sub);
    const items = populated?.items.map((i: any) => ({
      id: i._id,
      productId: i.product._id,
      product: i.product,
      quantity: i.quantity,
      userId: req.user!.sub,
    })) || [];

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

export const removeFromCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await CartModel.findOne({ user: req.user!.sub });
    if (!cart) throw new AppError('Cart not found', 404);

    cart.items = cart.items.filter((i: any) => i._id.toString() !== req.params.itemId) as any;
    await cart.save();

    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    next(error);
  }
};

export const clearCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await CartModel.findOneAndUpdate({ user: req.user!.sub }, { items: [] });
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
};
