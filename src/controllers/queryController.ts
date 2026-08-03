import { type Request, type Response, type NextFunction } from 'express';
import QueryModel from '../models/Query.js';
import { AppError } from '../middlewares/errorHandler.js';

export const submitQuery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, phone, type, message } = req.body;

    if (!name || !email || !phone || !type || !message) {
      throw new AppError('All fields are required', 400);
    }
    if (!['review', 'query'].includes(type)) {
      throw new AppError('Invalid type', 400);
    }

    const query = await QueryModel.create({ name, email, phone, type, message });
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
    if (status && ['unread', 'read', 'resolved'].includes(status)) filter.status = status;
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

    if (!['unread', 'read', 'resolved'].includes(status)) {
      throw new AppError('Invalid status', 400);
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
