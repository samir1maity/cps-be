import { type Request, type Response, type NextFunction } from 'express';
import ProductModel from '../models/Product.js';
import CategoryModel from '../models/Category.js';
import { AppError } from '../middlewares/errorHandler.js';
import multer from 'multer';
import path from 'path';
import { uploadToS3 } from '../services/s3Service.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const buildProductResponse = (p: any) => ({
  id: p._id,
  name: p.name,
  description: p.description,
  price: p.price,
  originalPrice: p.originalPrice,
  images: p.images,
  category: p.category,
  subcategory: p.subcategory,
  brand: p.brand,
  inStock: p.inStock,
  stockQuantity: p.stockQuantity,
  rating: p.rating,
  reviewCount: p.reviewCount,
  tags: p.tags,
  specifications: p.specifications instanceof Map
    ? Object.fromEntries(p.specifications)
    : p.specifications,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export const getProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      category, subcategory, search, minPrice, maxPrice,
      inStock, page = '1', limit = '12', sort = '-createdAt',
    } = req.query as Record<string, string>;

    const filter: Record<string, any> = { isActive: true };

    if (category) {
      const cat = await CategoryModel.findOne({ slug: category });
      if (cat) filter.category = cat._id;
    }

    if (subcategory) {
      const sub = await CategoryModel.findOne({ slug: subcategory });
      if (sub) filter.subcategory = sub._id;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (inStock !== undefined) {
      filter.inStock = inStock === 'true';
    }

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

export const getProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await ProductModel.findOne({ _id: req.params.id, isActive: true })
      .populate('category', 'id name slug')
      .populate('subcategory', 'id name slug');

    if (!product) throw new AppError('Product not found', 404);

    res.json({ success: true, data: buildProductResponse(product) });
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, price, originalPrice, categoryId, subcategoryId, brand, stockQuantity, tags, specifications } = req.body;

    const category = await CategoryModel.findById(categoryId);
    if (!category) throw new AppError('Category not found', 404);

    const images: string[] = [];

    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        const key = `products/${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
        const url = await uploadToS3(file.buffer, key, file.mimetype);
        images.push(url);
      }
    }

    const product = await ProductModel.create({
      name,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      images,
      category: categoryId,
      subcategory: subcategoryId || null,
      brand: brand || 'Creative Pottery Studio',
      stockQuantity: Number(stockQuantity) || 0,
      inStock: Number(stockQuantity) > 0,
      tags: tags ? JSON.parse(tags) : [],
      specifications: specifications ? JSON.parse(specifications) : {},
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

export const updateProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw new AppError('Product not found', 404);

    const { name, description, price, originalPrice, categoryId, subcategoryId, brand, stockQuantity, tags, specifications, isActive } = req.body;

    const newImages: string[] = [...product.images];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        const key = `products/${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
        const url = await uploadToS3(file.buffer, key, file.mimetype);
        newImages.push(url);
      }
    }

    const updates: Record<string, any> = {};
    if (name) updates.name = name;
    if (description) updates.description = description;
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
    if (newImages.length !== product.images.length) updates.images = newImages;

    const updated = await ProductModel.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('category', 'id name slug')
      .populate('subcategory', 'id name slug');

    res.json({ success: true, data: buildProductResponse(updated!) });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await ProductModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!product) throw new AppError('Product not found', 404);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};
