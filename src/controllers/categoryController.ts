import { type Request, type Response, type NextFunction } from 'express';
import CategoryModel from '../models/Category.js';
import ProductModel from '../models/Product.js';
import { AppError } from '../middlewares/errorHandler.js';

export const getCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await CategoryModel.find({ isActive: true, parentId: null });

    // Fetch children for each top-level category
    const result = await Promise.all(
      categories.map(async (cat) => {
        const children = await CategoryModel.find({ parentId: cat._id, isActive: true });
        const productCount = await ProductModel.countDocuments({ category: cat._id, isActive: true });
        return {
          id: cat._id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          image: cat.image,
          productCount,
          children: children.map(c => ({
            id: c._id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            image: c.image,
            parentId: c.parentId,
            productCount: 0,
          })),
        };
      })
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getCategoryBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cat = await CategoryModel.findOne({ slug: req.params.slug, isActive: true });
    if (!cat) throw new AppError('Category not found', 404);

    const children = await CategoryModel.find({ parentId: cat._id, isActive: true });
    const productCount = await ProductModel.countDocuments({ category: cat._id, isActive: true });

    res.json({
      success: true,
      data: {
        id: cat._id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
        parentId: cat.parentId,
        productCount,
        children: children.map(c => ({
          id: c._id,
          name: c.name,
          slug: c.slug,
          parentId: c.parentId,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
