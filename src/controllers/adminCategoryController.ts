import { type Request, type Response, type NextFunction } from 'express';
import { body } from 'express-validator';
import CategoryModel from '../models/Category.js';
import ProductModel from '../models/Product.js';
import { AppError } from '../middlewares/errorHandler.js';
import { validate } from '../middlewares/validate.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const slugify = (text: string): string =>
  text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Shape used in every GET response. */
const formatCategory = (cat: any, children: any[] = [], productCount = 0) => ({
  id: cat._id,
  name: cat.name,
  slug: cat.slug,
  description: cat.description ?? null,
  image: cat.image ?? null,
  parentId: cat.parentId ?? null,
  isActive: cat.isActive,
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

  body('image')
    .optional()
    .trim()
    .isURL().withMessage('Image must be a valid URL'),

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

  body('image')
    .optional({ nullable: true })
    .custom((val) => {
      if (!val) return true;
      try { new URL(val); return true; } catch { throw new Error('Image must be a valid URL'); }
    }),

  body('parentId')
    .optional({ nullable: true })
    .custom(async (val, { req }) => {
      if (!val) return true;
      // Cannot make a category its own parent
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

/**
 * GET /admin/categories
 * Returns all top-level categories with their subcategories and product counts.
 * Accepts ?includeInactive=true to also return inactive entries.
 */
export const listCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const showInactive = req.query.includeInactive === 'true';
    const baseFilter = showInactive ? {} : { isActive: true };

    const topLevel = await CategoryModel.find({ ...baseFilter, parentId: null }).sort('name');

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
          })
        );

        return formatCategory(cat, formattedChildren, productCount);
      })
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /admin/categories/:id
 * Returns a single category (top-level or sub) with its children and product count.
 */
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
      })
    );

    res.json({ success: true, data: formatCategory(cat, formattedChildren, productCount) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /admin/categories
 * Creates a category or subcategory.
 * If parentId is provided the new entry is treated as a subcategory.
 * Slug is auto-generated from name when not supplied.
 */
export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, image, parentId } = req.body;
    let { slug } = req.body;

    // Auto-generate slug when not provided
    if (!slug) {
      slug = slugify(name);
    }

    // Ensure slug is unique
    const existing = await CategoryModel.findOne({ slug });
    if (existing) {
      throw new AppError(`Slug "${slug}" is already in use. Provide a unique slug.`, 409);
    }

    const category = await CategoryModel.create({
      name,
      slug,
      description: description || undefined,
      image: image || undefined,
      parentId: parentId || null,
    });

    // Populate parent for response
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

/**
 * PUT /admin/categories/:id
 * Updates a category or subcategory.
 * Changing parentId moves it to a different parent (or promotes to top-level when null).
 */
export const updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cat = await CategoryModel.findById(req.params.id);
    if (!cat) throw new AppError('Category not found', 404);

    const { name, slug, description, image, parentId, isActive } = req.body;
    const updates: Record<string, any> = {};

    if (name !== undefined) updates.name = name;

    if (slug !== undefined) {
      // Only check uniqueness if the slug is actually changing
      if (slug !== cat.slug) {
        const conflict = await CategoryModel.findOne({ slug, _id: { $ne: cat._id } });
        if (conflict) throw new AppError(`Slug "${slug}" is already in use.`, 409);
        updates.slug = slug;
      }
    }

    if (description !== undefined) updates.description = description;
    if (image !== undefined) updates.image = image;
    if (isActive !== undefined) updates.isActive = isActive;

    // parentId: explicit null means "promote to top-level"
    if ('parentId' in req.body) {
      updates.parentId = parentId ?? null;
    }

    // Guard: cannot set a category that has children to have a parentId
    // (would create grandchildren which exceed our max depth of 1)
    if (updates.parentId) {
      const hasChildren = await CategoryModel.exists({ parentId: cat._id });
      if (hasChildren) {
        throw new AppError(
          'Cannot turn a category into a subcategory when it already has subcategories. Remove its subcategories first.',
          400
        );
      }
    }

    const updated = await CategoryModel.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: formatCategory(updated!),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /admin/categories/:id
 * Soft-deletes (sets isActive = false) by default.
 * Pass ?hard=true for a permanent deletion (only allowed when no active products reference it).
 */
export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cat = await CategoryModel.findById(req.params.id);
    if (!cat) throw new AppError('Category not found', 404);

    const hardDelete = req.query.hard === 'true';

    // Check for referencing products
    const productCount = await ProductModel.countDocuments({
      $or: [{ category: cat._id }, { subcategory: cat._id }],
      isActive: true,
    });

    if (productCount > 0) {
      throw new AppError(
        `Cannot delete: ${productCount} active product(s) reference this category. Reassign or deactivate them first.`,
        409
      );
    }

    if (hardDelete) {
      // Also hard-delete any subcategories (only safe because products check passed)
      await CategoryModel.deleteMany({ parentId: cat._id });
      await CategoryModel.findByIdAndDelete(cat._id);

      res.json({ success: true, message: 'Category permanently deleted' });
    } else {
      // Soft-delete: deactivate this category and all its subcategories
      await CategoryModel.updateMany({ parentId: cat._id }, { isActive: false });
      await CategoryModel.findByIdAndUpdate(cat._id, { isActive: false });

      res.json({ success: true, message: 'Category deactivated successfully' });
    }
  } catch (error) {
    next(error);
  }
};
