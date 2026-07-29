import { type Request, type Response, type NextFunction } from 'express';
import CarouselSlideModel from '../models/CarouselSlide.js';
import { storage } from '../storage/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';

// Resolve imageKey → signed URL, leave everything else as-is.
async function withSignedUrl(slide: any) {
  const plain = slide.toObject ? slide.toObject() : { ...slide };
  if (plain.imageKey) {
    plain.imageUrl = await storage.getSignedDownloadUrl(plain.imageKey);
  } else {
    plain.imageUrl = null;
  }
  return plain;
}

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/carousel
 * Returns active slides ordered by `order`, each with a signed image URL.
 */
export const getActiveSlides = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const slides = await CarouselSlideModel.find({ isActive: true }).sort({ order: 1 });
    const data = await Promise.all(slides.map(withSignedUrl));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/carousel
 * Returns ALL slides (active + inactive) for the admin management page.
 */
export const getAllSlides = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const slides = await CarouselSlideModel.find().sort({ order: 1 });
    const data = await Promise.all(slides.map(withSignedUrl));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/admin/carousel
 * Create a new slide. `order` defaults to one after the current last slide.
 */
export const createSlide = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { imageKey, bgColor, ctaLink, isActive } = req.body;

    const lastSlide = await CarouselSlideModel.findOne().sort({ order: -1 });
    const order = lastSlide ? lastSlide.order + 1 : 0;

    const slide = await CarouselSlideModel.create({
      imageKey: imageKey ?? '',
      bgColor: bgColor?.trim() ?? '',
      ctaLink: ctaLink?.trim() ?? '',
      order,
      isActive: isActive !== false,
    });

    res.status(201).json({ success: true, data: await withSignedUrl(slide) });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/admin/carousel/:id
 * Full update of a slide's fields (image key, text, CTA, visibility).
 */
export const updateSlide = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { imageKey, bgColor, ctaLink, isActive } = req.body;

    // Fetch before update so we can clean up the old S3 key if image changed.
    const existing = await CarouselSlideModel.findById(id);
    if (!existing) throw new AppError('Slide not found', 404);

    const update: Record<string, unknown> = {};
    if (imageKey !== undefined) update.imageKey = imageKey;
    if (bgColor !== undefined) update.bgColor = bgColor.trim();
    if (ctaLink !== undefined) update.ctaLink = ctaLink.trim();
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    const slide = await CarouselSlideModel.findByIdAndUpdate(id, update, { new: true });

    // Delete old S3 object if the image was replaced or removed.
    const oldKey = existing.imageKey;
    const newKey = imageKey;
    if (imageKey !== undefined && oldKey && oldKey !== newKey) {
      storage.delete(oldKey).catch(() => undefined);
    }

    res.json({ success: true, data: await withSignedUrl(slide!) });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/admin/carousel/:id
 * Deletes the slide document and its S3 image (best-effort).
 */
export const deleteSlide = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const slide = await CarouselSlideModel.findByIdAndDelete(id);
    if (!slide) throw new AppError('Slide not found', 404);

    // Best-effort S3 cleanup — failure doesn't fail the request.
    if (slide.imageKey) {
      storage.delete(slide.imageKey).catch(() => undefined);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/admin/carousel/reorder
 * Body: { order: string[] }  — array of slide _id strings in desired order.
 * Assigns sequential `order` values (0, 1, 2 …) matching the array position.
 */
export const reorderSlides = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { order } = req.body as { order?: string[] };
    if (!Array.isArray(order) || order.length === 0) {
      throw new AppError('order must be a non-empty array of slide IDs', 400);
    }

    await Promise.all(
      order.map((id, idx) => CarouselSlideModel.findByIdAndUpdate(id, { order: idx })),
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
