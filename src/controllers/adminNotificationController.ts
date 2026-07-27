import { type Request, type Response, type NextFunction } from 'express';
import AdminNotificationModel from '../models/AdminNotification.js';

export const getAdminNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const unreadOnly = req.query.unread === 'true';

    const filter = unreadOnly ? { isRead: false } : {};

    const [total, unreadCount, items] = await Promise.all([
      AdminNotificationModel.countDocuments(filter),
      AdminNotificationModel.countDocuments({ isRead: false }),
      AdminNotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      success: true,
      data: items,
      unreadCount,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminUnreadCount = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await AdminNotificationModel.countDocuments({ isRead: false });
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
};

export const markAdminNotificationRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await AdminNotificationModel.findByIdAndUpdate(id, { isRead: true });
    const unreadCount = await AdminNotificationModel.countDocuments({ isRead: false });
    res.json({ success: true, data: { unreadCount } });
  } catch (err) {
    next(err);
  }
};

export const markAllAdminNotificationsRead = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AdminNotificationModel.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true, data: { unreadCount: 0 } });
  } catch (err) {
    next(err);
  }
};
