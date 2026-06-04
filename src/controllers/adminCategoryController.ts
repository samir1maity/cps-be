import { type Request, type Response, type NextFunction } from 'express';
import { body } from 'express-validator';
import CategoryModel from '../models/Category.js';
import ProductModel from '../models/Product.js';
import { AppError } from '../middlewares/errorHandler.js';
import { validate } from '../middlewares/validate.js';
import { storage } from '../storage/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const slugify = (text: string): string =>
  text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Shape used in every GET response.
 * The stored image key is returned as-is; the frontend resolves it to a
 * signed URL via GET /api/v1/upload/sign/:key.
 */
const formatCategory = (cat: any, children: any[] = [], productCount = 0) => ({
  id: cat._id,
  name: cat.name,
  slug: cat.slug,
  description: cat.description ?? null,
  image: cat.image ?? null, // storage key — never a full URL
  parentId: cat.parentId ?? null,
  isActive: cat.isActive,
  sortOrder: cat.sortOrder ?? 0,
  productCount,
  children,
  createdAt: cat.createdAt,
  updatedAt: cat.updatedAt,
});

// ── Validation rules ─────────────────────────────────────────────────────────

export const createCategoryRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name must be at most 100 characters'),

  body('slug')
    .optional()
    .trim()
    .isSlug().withMessage('Slug must contain only lowercase letters, numbers and hyphens'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be at most 500 characters'),

  // imageKey is a storage key produced by POST /upload/presign → direct S3 PUT.
  body('imageKey').optional({ nullable: true }).trim(),

  body('parentId')
    .optional({ nullable: true })
    .custom(async (val) => {
      if (!val) return true;
      const parent = await CategoryModel.findById(val);
      if (!parent) throw new Error('Parent category not found');
      if (parent.parentId) throw new Error('Subcategories cannot be nested more than one level deep');
      return true;
    }),

  validate,
];

export const updateCategoryRules = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: 100 }).withMessage('Name must be at most 100 characters'),

  body('slug')
    .optional()
    .trim()
    .isSlug().withMessage('Slug must contain only lowercase letters, numbers and hyphens'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be at most 500 characters'),

  body('imageKey').optional({ nullable: true }).trim(),

  body('parentId')
    .optional({ nullable: true })
    .custom(async (val, { req }) => {
      if (!val) return true;
      if (val === req.params?.id) throw new Error('A category cannot be its own parent');
      const parent = await CategoryModel.findById(val);
      if (!parent) throw new Error('Parent category not found');
      if (parent.parentId) throw new Error('Subcategories cannot be nested more than one level deep');
      return true;
    }),

  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),

  validate,
];

// ── Handlers ─────────────────────────────────────────────────────────────────

export const listCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const showInactive = req.query.includeInactive === 'true';
    const baseFilter = showInactive ? {} : { isActive: true };

    const topLevel = await CategoryModel.find({ ...baseFilter, parentId: null }).sort({ sortOrder: 1, name: 1 });

    const result = await Promise.all(
      topLevel.map(async (cat) => {
        const [children, productCount] = await Promise.all([
          CategoryModel.find({ parentId: cat._id, ...baseFilter }).sort('name'),
          ProductModel.countDocuments({ category: cat._id, isActive: true }),
        ]);

        const formattedChildren = await Promise.all(
          children.map(async (child) => {
            const childProductCount = await ProductModel.countDocuments({
              $or: [{ category: child._id }, { subcategory: child._id }],
              isActive: true,
            });
            return formatCategory(child, [], childProductCount);
          }),
        );

        return formatCategory(cat, formattedChildren, productCount);
      }),
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cat = await CategoryModel.findById(req.params.id);
    if (!cat) throw new AppError('Category not found', 404);

    const [children, productCount] = await Promise.all([
      CategoryModel.find({ parentId: cat._id }).sort('name'),
      ProductModel.countDocuments({ category: cat._id, isActive: true }),
    ]);

    const formattedChildren = await Promise.all(
      children.map(async (child) => {
        const childCount = await ProductModel.countDocuments({
          $or: [{ category: child._id }, { subcategory: child._id }],
          isActive: true,
        });
        return formatCategory(child, [], childCount);
      }),
    );

    res.json({ success: true, data: formatCategory(cat, formattedChildren, productCount) });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, imageKey, parentId } = req.body;
    let { slug } = req.body;

    if (!slug) slug = slugify(name);

    const existing = await CategoryModel.findOne({ slug });
    if (existing) throw new AppError(`Slug "${slug}" is already in use. Provide a unique slug.`, 409);

    const category = await CategoryModel.create({
      name,
      slug,
      description: description || undefined,
      image: imageKey || undefined, // storage key, never a URL
      parentId: parentId || null,
    });

    const populated = await CategoryModel.findById(category._id).populate('parentId', 'id name slug');

    res.status(201).json({
      success: true,
      message: parentId ? 'Subcategory created successfully' : 'Category created successfully',
      data: formatCategory(populated!),
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cat = await CategoryModel.findById(req.params.id);
    if (!cat) throw new AppError('Category not found', 404);

    const { name, slug, description, imageKey, parentId, isActive } = req.body;
    const updates: Record<string, any> = {};

    if (name !== undefined) updates.name = name;

    if (slug !== undefined && slug !== cat.slug) {
      const conflict = await CategoryModel.findOne({ slug, _id: { $ne: cat._id } });
      if (conflict) throw new AppError(`Slug "${slug}" is already in use.`, 409);
      updates.slug = slug;
    }

    if (description !== undefined) updates.description = description;

    if (imageKey !== undefined) {
      // Delete old image from storage before replacing.
      if (cat.image) await storage.delete(cat.image);
      updates.image = imageKey || undefined; // null/empty clears the image
    }

    if (isActive !== undefined) updates.isActive = isActive;

    if ('parentId' in req.body) updates.parentId = parentId ?? null;

    if (updates.parentId) {
      const hasChildren = await CategoryModel.exists({ parentId: cat._id });
      if (hasChildren) {
        throw new AppError(
          'Cannot turn a category into a subcategory when it already has subcategories.',
          400,
        );
      }
    }

    const updated = await CategoryModel.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: 'Category updated successfully', data: formatCategory(updated!) });
  } catch (error) {
    next(error);
  }
};

export const reorderCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const items: { id: string; sortOrder: number }[] = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Request body must be a non-empty array of {id, sortOrder}', 400);
    }
    await Promise.all(
      items.map(({ id, sortOrder }) =>
        CategoryModel.findByIdAndUpdate(id, { sortOrder }),
      ),
    );
    res.json({ success: true, message: 'Category order saved' });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cat = await CategoryModel.findById(req.params.id);
    if (!cat) throw new AppError('Category not found', 404);

    const hardDelete = req.query.hard === 'true';

    const productCount = await ProductModel.countDocuments({
      $or: [{ category: cat._id }, { subcategory: cat._id }],
      isActive: true,
    });

    if (productCount > 0) {
      throw new AppError(
        `Cannot delete: ${productCount} active product(s) reference this category. Reassign or deactivate them first.`,
        409,
      );
    }

    if (hardDelete) {
      await CategoryModel.deleteMany({ parentId: cat._id });
      await CategoryModel.findByIdAndDelete(cat._id);
      res.json({ success: true, message: 'Category permanently deleted' });
    } else {
      await CategoryModel.updateMany({ parentId: cat._id }, { isActive: false });
      await CategoryModel.findByIdAndUpdate(cat._id, { isActive: false });
      res.json({ success: true, message: 'Category deactivated successfully' });
    }
  } catch (error) {
    next(error);
  }
};
