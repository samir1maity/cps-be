import { type Request, type Response, type NextFunction } from 'express';
import ProductModel from '../models/Product.js';
import CategoryModel from '../models/Category.js';
import { AppError } from '../middlewares/errorHandler.js';
import { storage } from '../storage/index.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import {
  deleteVariantImagesForProduct,
  deleteVariantImagesForColor,
} from './colorVariantImagesController.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildProductResponse = (p: any) => ({
  id: p._id,
  name: p.name,
  description: p.description,
  price: p.price,
  originalPrice: p.originalPrice,
  images: p.images as string[],
  // Expose stock per color so the frontend can show per-variant availability
  colors: (p.colors ?? []).map((c: any) => ({
    _id: c._id,
    name: c.name,
    imageKey: c.imageKey,
    stock: c.stock ?? 0,
  })),
  category: p.category,
  subcategory: p.subcategory,
  brand: p.brand,
  inStock: p.inStock,
  stockQuantity: p.stockQuantity,
  rating: p.rating,
  reviewCount: p.reviewCount,
  tags: p.tags,
  specifications:
    p.specifications instanceof Map
      ? Object.fromEntries(p.specifications)
      : p.specifications,
  isFeatured: p.isFeatured ?? false,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

// ── Route handlers ────────────────────────────────────────────────────────────

export const getProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      category,
      subcategory,
      search,
      minPrice,
      maxPrice,
      inStock,
      featured,
      page = '1',
      limit = '12',
      sort = '-createdAt',
    } = req.query as Record<string, string>;

    const filter: Record<string, any> = { isActive: true };
    if (featured === 'true') filter.isFeatured = true;

    if (category) {
      const cat = await CategoryModel.findOne({ slug: category });
      if (cat) filter.category = cat._id;
    }
    if (subcategory) {
      const sub = await CategoryModel.findOne({ slug: subcategory });
      if (sub) filter.subcategory = sub._id;
    }
    if (search) filter.$text = { $search: search };
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (inStock !== undefined) filter.inStock = inStock === 'true';

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate('category', 'id name slug')
        .populate('subcategory', 'id name slug')
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      ProductModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: products.map(buildProductResponse),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const product = await ProductModel.findOne({
      _id: req.params.id,
      isActive: true,
    })
      .populate('category', 'id name slug')
      .populate('subcategory', 'id name slug');

    if (!product) throw new AppError('Product not found', 404);
    res.json({ success: true, data: buildProductResponse(product) });
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      name,
      description,
      price,
      originalPrice,
      categoryId,
      subcategoryId,
      brand,
      stockQuantity,
      tags,
      specifications,
      imageKeys,
      colors, // JSON array of { name, imageKey, stock }
    } = req.body;

    const category = await CategoryModel.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);

    let images: string[] = [];
    if (imageKeys) {
      try {
        images = JSON.parse(imageKeys);
        if (!Array.isArray(images)) images = [];
      } catch {
        images = [];
      }
    }

    let colorVariants: Array<{ name: string; imageKey: string; stock: number }> = [];
    if (colors) {
      try {
        const parsed = JSON.parse(colors);
        if (Array.isArray(parsed)) {
          colorVariants = parsed.map((c: any) => ({
            name: String(c.name ?? '').trim(),
            imageKey: String(c.imageKey ?? ''),
            stock: Math.max(0, parseInt(c.stock ?? '0', 10) || 0),
          }));
        }
      } catch {
        colorVariants = [];
      }
    }

    const hasColors = colorVariants.length > 0;
    // For plain products, use the provided stockQuantity.
    // For color-variant products, stockQuantity is derived by the pre-save hook.
    const plainStock = hasColors ? 0 : Math.max(0, Number(stockQuantity) || 0);

    const product = await ProductModel.create({
      name,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      images,
      colors: colorVariants,
      category: categoryId,
      subcategory: subcategoryId || null,
      brand: brand || 'Creative Pottery Studio',
      stockQuantity: plainStock,
      inStock: plainStock > 0,
      tags: tags ? JSON.parse(tags) : [],
      specifications: specifications ? JSON.parse(specifications) : {},
      isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
    });

    const populated = await product.populate([
      { path: 'category', select: 'id name slug' },
      { path: 'subcategory', select: 'id name slug' },
    ]);

    res.status(201).json({ success: true, data: buildProductResponse(populated) });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new AppError('Product not found', 404);

    const {
      name,
      description,
      price,
      originalPrice,
      categoryId,
      subcategoryId,
      brand,
      stockQuantity,
      tags,
      specifications,
      isActive,
      imageKeys,
      removeImages,
      orderedImageKeys,
      colors, // JSON array of { _id?, name, imageKey, stock } — full replacement
    } = req.body;

    let imageKeyList: string[] = [...product.images];

    if (removeImages) {
      const toRemove: string[] = JSON.parse(removeImages);
      await Promise.all(toRemove.map((k) => storage.delete(k)));
      imageKeyList = imageKeyList.filter((k) => !toRemove.includes(k));
    }
    if (imageKeys) {
      const newKeys: string[] = JSON.parse(imageKeys);
      imageKeyList.push(...newKeys);
    }
    if (orderedImageKeys) {
      imageKeyList = JSON.parse(orderedImageKeys);
    }

    const updates: Record<string, any> = { images: imageKeyList };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = Number(price);
    if (originalPrice !== undefined) updates.originalPrice = Number(originalPrice);
    if (categoryId) updates.category = categoryId;
    if (subcategoryId !== undefined) updates.subcategory = subcategoryId || null;
    if (brand) updates.brand = brand;
    if (tags) updates.tags = JSON.parse(tags);
    if (specifications) updates.specifications = JSON.parse(specifications);
    if (isActive !== undefined) updates.isActive = isActive === 'true' || isActive === true;
    if (req.body.isFeatured !== undefined)
      updates.isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;

    let removedColorIds: string[] = [];

    if (colors !== undefined) {
      try {
        const parsed = JSON.parse(colors);
        const incoming: Array<{ _id?: string; name: string; imageKey: string; stock: number }> =
          Array.isArray(parsed)
            ? parsed.map((c: any) => ({
                _id: c._id,
                name: String(c.name ?? '').trim(),
                imageKey: String(c.imageKey ?? ''),
                stock: Math.max(0, parseInt(c.stock ?? '0', 10) || 0),
              }))
            : [];

        updates.colors = incoming;

        // Collect removed color IDs for gallery cleanup
        const incomingIds = new Set(incoming.map((c) => String(c._id)).filter(Boolean));
        removedColorIds = (product.colors ?? [])
          .map((c: any) => String(c._id))
          .filter((id: string) => !incomingIds.has(id));

        // For color-variant products the pre-save hook computes stockQuantity.
        // For plain products (no colors after update) use the provided stockQuantity.
        if (incoming.length === 0 && stockQuantity !== undefined) {
          updates.stockQuantity = Math.max(0, Number(stockQuantity) || 0);
          updates.inStock = updates.stockQuantity > 0;
        }
      } catch {
        updates.colors = [];
        if (stockQuantity !== undefined) {
          updates.stockQuantity = Math.max(0, Number(stockQuantity) || 0);
          updates.inStock = updates.stockQuantity > 0;
        }
      }
    } else if (stockQuantity !== undefined && (product.colors ?? []).length === 0) {
      // Plain product with no color change — update stock directly
      updates.stockQuantity = Math.max(0, Number(stockQuantity) || 0);
      updates.inStock = updates.stockQuantity > 0;
    }

    // findByIdAndUpdate bypasses pre-save hooks, so we use save() to trigger them
    Object.assign(product, updates);
    await product.save();

    const updated = await ProductModel.findById(req.params.id)
      .populate('category', 'id name slug')
      .populate('subcategory', 'id name slug');

    // Clean up gallery docs for removed color variants (fire-and-forget)
    if (removedColorIds.length > 0) {
      const productId = String(req.params.id);
      Promise.all(
        removedColorIds.map((colorId) => deleteVariantImagesForColor(productId, colorId)),
      ).catch((err) => console.error('[updateProduct] variant images cleanup error:', err));
    }

    res.json({ success: true, data: buildProductResponse(updated!) });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const product = await ProductModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: false },
    );
    if (!product) throw new AppError('Product not found', 404);

    if (Array.isArray(product.images) && product.images.length > 0) {
      Promise.all(product.images.map((key: string) => storage.delete(key))).catch(
        (err) => console.error('[deleteProduct] S3 cleanup error:', err),
      );
    }

    deleteVariantImagesForProduct(String(product._id)).catch((err) =>
      console.error('[deleteProduct] variant images cleanup error:', err),
    );

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};
