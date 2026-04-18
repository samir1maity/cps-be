import { type Request, type Response, type NextFunction } from 'express';
import ProductModel from '../models/Product.js';
import CategoryModel from '../models/Category.js';
import { AppError } from '../middlewares/errorHandler.js';
import { storage } from '../storage/index.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the API response shape for a product document.
 * Image keys stored in the DB are returned as-is.
 * The frontend calls GET /api/v1/upload/sign/:key to get a signed URL.
 */
const buildProductResponse = (p: any) => ({
  id: p._id,
  name: p.name,
  description: p.description,
  price: p.price,
  originalPrice: p.originalPrice,
  images: p.images as string[], // stored keys — frontend resolves to signed URLs
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
      imageKeys, // JSON array of storage keys sent by the frontend after direct S3 upload
    } = req.body;

    const category = await CategoryModel.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);

    // Parse imageKeys — frontend sends a JSON-encoded array of storage keys.
    let images: string[] = [];
    if (imageKeys) {
      try {
        images = JSON.parse(imageKeys);
        if (!Array.isArray(images)) images = [];
      } catch {
        images = [];
      }
    }

    const product = await ProductModel.create({
      name,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      images, // storage keys, never full URLs
      category: categoryId,
      subcategory: subcategoryId || null,
      brand: brand || 'Creative Pottery Studio',
      stockQuantity: Number(stockQuantity) || 0,
      inStock: Number(stockQuantity) > 0,
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
      imageKeys,        // JSON array of NEW keys to append
      removeImages,     // JSON array of keys to remove
      orderedImageKeys, // JSON array — full ordered list (primary first), overrides append logic
    } = req.body;

    let imageKeyList: string[] = [...product.images];

    // Remove explicitly deleted keys from storage and the list.
    if (removeImages) {
      const toRemove: string[] = JSON.parse(removeImages);
      await Promise.all(toRemove.map((k) => storage.delete(k)));
      imageKeyList = imageKeyList.filter((k) => !toRemove.includes(k));
    }

    // Append newly uploaded keys.
    if (imageKeys) {
      const newKeys: string[] = JSON.parse(imageKeys);
      imageKeyList.push(...newKeys);
    }

    // If frontend sent the full ordered list (primary first), use it directly.
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
    if (stockQuantity !== undefined) {
      updates.stockQuantity = Number(stockQuantity);
      updates.inStock = Number(stockQuantity) > 0;
    }
    if (tags) updates.tags = JSON.parse(tags);
    if (specifications) updates.specifications = JSON.parse(specifications);
    if (isActive !== undefined) updates.isActive = isActive === 'true' || isActive === true;
    if (req.body.isFeatured !== undefined)
      updates.isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;

    const updated = await ProductModel.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('category', 'id name slug')
      .populate('subcategory', 'id name slug');

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
      { new: false }, // return the doc before update to read its image keys
    );
    if (!product) throw new AppError('Product not found', 404);

    // Delete all stored images from S3 (fire-and-forget — don't block the response).
    if (Array.isArray(product.images) && product.images.length > 0) {
      Promise.all(product.images.map((key: string) => storage.delete(key))).catch(
        (err) => console.error('[deleteProduct] S3 cleanup error:', err),
      );
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};
