import { type Request, type Response, type NextFunction } from 'express';
import ColorVariantImagesModel from '../models/ColorVariantImages.js';
import ProductModel from '../models/Product.js';
import { AppError } from '../middlewares/errorHandler.js';
import { storage } from '../storage/index.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

// ── Public ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/products/:id/variant-images
 * Returns a map of { [colorId]: string[] } for all color variants of a product.
 * Only fetched on the product detail page — zero impact on listings/cart/orders.
 */
export const getVariantImages = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const docs = await ColorVariantImagesModel.find({ productId: req.params.id });

    const result: Record<string, string[]> = {};
    docs.forEach((doc) => {
      result[String(doc.colorId)] = doc.imageKeys as string[];
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// ── Admin ──────────────────────────────────────────────────────────────────────

/**
 * PUT /api/v1/products/:id/variant-images  (admin only)
 * Body: { galleries: Array<{ colorId: string; imageKeys: string[] }> }
 *
 * Upserts gallery docs for the given color IDs.
 * Image keys not in any gallery doc are deleted from storage (clean up removed images).
 */
export const saveVariantImages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id: productId } = req.params;
    const { galleries } = req.body as {
      galleries: Array<{ colorId: string; imageKeys: string[] }>;
    };

    if (!Array.isArray(galleries)) throw new AppError('galleries must be an array', 400);

    const product = await ProductModel.findById(productId);
    if (!product) throw new AppError('Product not found', 404);

    // Validate that each colorId actually belongs to this product.
    const validColorIds = new Set(product.colors.map((c) => String(c._id)));
    for (const g of galleries) {
      if (!validColorIds.has(g.colorId)) {
        throw new AppError(`colorId ${g.colorId} does not belong to this product`, 400);
      }
    }

    // Load existing docs to identify removed images for S3 cleanup.
    const existing = await ColorVariantImagesModel.find({ productId });
    const incomingKeys = new Set(galleries.flatMap((g) => g.imageKeys));

    const removedKeys: string[] = [];
    existing.forEach((doc) => {
      (doc.imageKeys as string[]).forEach((key) => {
        if (!incomingKeys.has(key)) removedKeys.push(key);
      });
    });

    // Upsert each gallery entry.
    await Promise.all(
      galleries.map((g) =>
        ColorVariantImagesModel.findOneAndUpdate(
          { productId, colorId: g.colorId },
          { imageKeys: g.imageKeys },
          { upsert: true, new: true },
        ),
      ),
    );

    // Delete gallery docs for color IDs no longer present in the payload.
    const incomingColorIds = galleries.map((g) => g.colorId);
    await ColorVariantImagesModel.deleteMany({
      productId,
      colorId: { $nin: incomingColorIds },
    });

    // Fire-and-forget S3 cleanup for removed image keys.
    if (removedKeys.length > 0) {
      Promise.all(removedKeys.map((k) => storage.delete(k))).catch((err) =>
        console.error('[saveVariantImages] S3 cleanup error:', err),
      );
    }

    res.json({ success: true, message: 'Variant images saved' });
  } catch (error) {
    next(error);
  }
};

/**
 * Called internally when a product is deleted or a color variant is removed.
 * Deletes all ColorVariantImages docs for the product (or a specific colorId)
 * and cleans up S3 keys.
 */
export const deleteVariantImagesForProduct = async (productId: string): Promise<void> => {
  const docs = await ColorVariantImagesModel.find({ productId });
  const keys = docs.flatMap((d) => d.imageKeys as string[]);

  await ColorVariantImagesModel.deleteMany({ productId });

  if (keys.length > 0) {
    Promise.all(keys.map((k) => storage.delete(k))).catch((err) =>
      console.error('[deleteVariantImagesForProduct] S3 cleanup error:', err),
    );
  }
};

/**
 * Called internally when a single color variant is removed during product update.
 */
export const deleteVariantImagesForColor = async (
  productId: string,
  colorId: string,
): Promise<void> => {
  const doc = await ColorVariantImagesModel.findOneAndDelete({ productId, colorId });
  if (!doc) return;

  const keys = doc.imageKeys as string[];
  if (keys.length > 0) {
    Promise.all(keys.map((k) => storage.delete(k))).catch((err) =>
      console.error('[deleteVariantImagesForColor] S3 cleanup error:', err),
    );
  }
};
