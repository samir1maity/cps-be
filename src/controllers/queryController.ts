import { type Request, type Response, type NextFunction } from 'express';
import QueryModel from '../models/Query.js';
import { AppError } from '../middlewares/errorHandler.js';

/**
 * GET /api/v1/queries/reviews
 * Public — returns admin-featured approved reviews for the home page (max 9).
 * Falls back to latest approved if none are featured.
 * Only exposes name and message — no email or phone.
 */
export const getPublicReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Try featured first
    let items = await QueryModel.find({ type: 'review', status: 'approved', featuredOnHome: true })
      .sort({ createdAt: -1 })
      .limit(9)
      .select('name message createdAt');

    // Fallback: latest approved (max 9) if admin hasn't featured any
    if (items.length === 0) {
      items = await QueryModel.find({ type: 'review', status: 'approved' })
        .sort({ createdAt: -1 })
        .limit(9)
        .select('name message createdAt');
    }

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/admin/queries/:id/feature
 * Admin — toggle featuredOnHome on an approved review.
 */
export const toggleFeaturedReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await QueryModel.findById(id).select('type status featuredOnHome');
    if (!existing) throw new AppError('Review not found', 404);
    if (existing.type !== 'review') throw new AppError('Only reviews can be featured', 400);
    if (existing.status !== 'approved') throw new AppError('Only approved reviews can be featured', 400);

    // Cap at 9 featured at a time
    if (!existing.featuredOnHome) {
      const featuredCount = await QueryModel.countDocuments({ type: 'review', status: 'approved', featuredOnHome: true });
      if (featuredCount >= 9) throw new AppError('Maximum 9 reviews can be featured on the home page', 400);
    }

    const updated = await QueryModel.findByIdAndUpdate(
      id,
      { featuredOnHome: !existing.featuredOnHome },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/queries/reviews/all
 * Public — paginated list of all approved reviews.
 */
export const getAllPublicReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(24, parseInt(req.query.limit as string) || 12);
    const [total, items] = await Promise.all([
      QueryModel.countDocuments({ type: 'review', status: 'approved' }),
      QueryModel.find({ type: 'review', status: 'approved' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name message createdAt'),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

export const submitQuery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, phone, type, message } = req.body;

    if (!name || !email || !phone || !type || !message) {
      throw new AppError('All fields are required', 400);
    }
    if (!['review', 'query'].includes(type)) {
      throw new AppError('Invalid type', 400);
    }

    // Reviews start as 'pending' (await admin approval); queries start as 'unread'
    const defaultStatus = type === 'review' ? 'pending' : 'unread';
    const query = await QueryModel.create({ name, email, phone, type, message, status: defaultStatus });
    res.status(201).json({ success: true, data: query });
  } catch (err) {
    next(err);
  }
};

export const getQueries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    const filter: Record<string, string> = {};
    const ALL_FILTER_STATUSES = ['unread', 'read', 'resolved', 'pending', 'approved', 'rejected'];
    if (status && ALL_FILTER_STATUSES.includes(status)) filter.status = status;
    if (type && ['review', 'query'].includes(type)) filter.type = type;

    const [total, items] = await Promise.all([
      QueryModel.countDocuments(filter),
      QueryModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

export const updateQueryStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    const QUERY_STATUSES = ['unread', 'read', 'resolved'];
    const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
    const ALL_STATUSES = [...QUERY_STATUSES, ...REVIEW_STATUSES];

    if (!ALL_STATUSES.includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    // Enforce correct statuses per type
    const existing = await QueryModel.findById(id).select('type');
    if (!existing) throw new AppError('Query not found', 404);
    const allowed = existing.type === 'review' ? REVIEW_STATUSES : QUERY_STATUSES;
    if (!allowed.includes(status)) {
      throw new AppError(`Status "${status}" is not valid for type "${existing.type}"`, 400);
    }

    const query = await QueryModel.findByIdAndUpdate(
      id,
      { status, ...(adminNote !== undefined && { adminNote }) },
      { new: true }
    );

    if (!query) throw new AppError('Query not found', 404);

    res.json({ success: true, data: query });
  } catch (err) {
    next(err);
  }
};
