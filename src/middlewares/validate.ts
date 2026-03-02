import { type Request, type Response, type NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from './errorHandler.js';

export const validate = (req: Request, _res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => e.msg).join(', ');
    next(new AppError(messages, 400));
    return;
  }
  next();
};
