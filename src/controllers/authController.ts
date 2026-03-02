import { type Request, type Response, type NextFunction } from 'express';
import AdminModel from '../models/Admin.js';
import UserModel from '../models/User.js';
import { AppError } from '../middlewares/errorHandler.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signRefreshToken, signToken, verifyRefreshToken, type AuthRole } from '../utils/jwt.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import logger from '../utils/logger.js';

interface SignupBody {
  name: string;
  email: string;
  password: string;
  role?: AuthRole;
}

interface LoginBody {
  email: string;
  password: string;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, role }: SignupBody = req.body || {};

    if (!name || !email || !password) {
      throw new AppError('Name, email, and password are required', 400);
    }

    const normalizedEmail = normalizeEmail(email);

    const [adminExists, userExists] = await Promise.all([
      AdminModel.findOne({ email: normalizedEmail }),
      UserModel.findOne({ email: normalizedEmail }),
    ]);

    if (adminExists || userExists) {
      throw new AppError('Email is already in use', 409);
    }

    const passwordHash = await hashPassword(password);
    const targetRole: AuthRole = role === 'admin' ? 'admin' : 'user';

    const doc = targetRole === 'admin'
      ? await AdminModel.create({ name, email: normalizedEmail, passwordHash })
      : await UserModel.create({ name, email: normalizedEmail, passwordHash });

    const accessToken = signToken({ sub: doc.id, role: targetRole });
    const refreshToken = signRefreshToken({ sub: doc.id, role: targetRole });

    logger.info('User registered', { userId: doc.id, role: targetRole });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: doc.id,
          name: doc.name,
          email: doc.email,
          role: targetRole.toUpperCase(),
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password }: LoginBody = req.body || {};

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const normalizedEmail = normalizeEmail(email);

    const admin = await AdminModel.findOne({ email: normalizedEmail });
    if (admin) {
      const ok = await verifyPassword(password, admin.passwordHash);
      if (!ok) {
        logger.warn('Failed login attempt', { email: normalizedEmail, role: 'admin' });
        throw new AppError('Invalid credentials', 401);
      }

      const accessToken = signToken({ sub: admin.id, role: 'admin' });
      const refreshToken = signRefreshToken({ sub: admin.id, role: 'admin' });

      logger.info('Admin logged in', { userId: admin.id });

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: 'ADMIN',
          },
          accessToken,
          refreshToken,
        },
      });
      return;
    }

    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      logger.warn('Failed login attempt - user not found', { email: normalizedEmail });
      throw new AppError('Invalid credentials', 401);
    }

    if (user.isBlocked) {
      throw new AppError('Your account has been blocked. Please contact support.', 403);
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      logger.warn('Failed login attempt', { email: normalizedEmail, role: 'user' });
      throw new AppError('Invalid credentials', 401);
    }

    const accessToken = signToken({ sub: user.id, role: 'user' });
    const refreshToken = signRefreshToken({ sub: user.id, role: 'user' });

    logger.info('User logged in', { userId: user.id });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'USER',
          phone: user.phone,
          avatar: user.avatar,
          addresses: user.addresses,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshAccessToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    const payload = verifyRefreshToken(refreshToken);

    // Verify user still exists
    if (payload.role === 'admin') {
      const doc = await AdminModel.findById(payload.sub);
      if (!doc) throw new AppError('User not found', 404);
    } else {
      const doc = await UserModel.findById(payload.sub);
      if (!doc) throw new AppError('User not found', 404);
    }

    const newAccessToken = signToken({ sub: payload.sub, role: payload.role });
    const newRefreshToken = signRefreshToken({ sub: payload.sub, role: payload.role });

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    next(new AppError('Invalid or expired refresh token', 401));
  }
};

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sub, role } = req.user!;

    if (role === 'admin') {
      const doc = await AdminModel.findById(sub).select('-passwordHash');
      if (!doc) throw new AppError('User not found', 404);
      res.json({
        success: true,
        data: { id: doc.id, name: doc.name, email: doc.email, role: 'ADMIN' },
      });
      return;
    }

    const doc = await UserModel.findById(sub).select('-passwordHash');
    if (!doc) throw new AppError('User not found', 404);

    res.json({
      success: true,
      data: {
        id: doc.id,
        name: doc.name,
        email: doc.email,
        role: 'USER',
        phone: doc.phone,
        avatar: doc.avatar,
        addresses: doc.addresses,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
  // Stateless JWT - client clears tokens
  res.json({ success: true, message: 'Logged out successfully' });
};
