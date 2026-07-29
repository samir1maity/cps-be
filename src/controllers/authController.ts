import crypto from 'crypto';
import { type Request, type Response, type NextFunction } from 'express';
import AdminModel from '../models/Admin.js';
import UserModel from '../models/User.js';
import { AppError } from '../middlewares/errorHandler.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signRefreshToken, signToken, verifyRefreshToken, type AuthRole } from '../utils/jwt.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import { sendPasswordResetOtpEmail } from '../services/notificationService.js';
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

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

type ResettableAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordResetOtpHash?: string | null;
  passwordResetOtpExpiresAt?: Date | null;
  passwordResetLastSentAt?: Date | null;
  passwordResetAttemptCount?: number | null;
  isBlocked?: boolean;
  set: (path: string, value: unknown) => unknown;
  save: () => Promise<unknown>;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const PASSWORD_RESET_OTP_LENGTH = 6;
const PASSWORD_RESET_OTP_EXPIRES_MINUTES = 10;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

const genericForgotPasswordMessage =
  'If an account exists for this email, an OTP has been sent.';

const generateNumericOtp = (): string =>
  crypto.randomInt(10 ** (PASSWORD_RESET_OTP_LENGTH - 1), 10 ** PASSWORD_RESET_OTP_LENGTH).toString();

const hashOtp = (otp: string): string =>
  crypto.createHash('sha256').update(otp).digest('hex');

const clearPasswordResetState = (account: ResettableAccount): void => {
  account.set('passwordResetOtpHash', undefined);
  account.set('passwordResetOtpExpiresAt', undefined);
  account.set('passwordResetLastSentAt', undefined);
  account.passwordResetAttemptCount = 0;
};

const findResettableAccountByEmail = async (email: string): Promise<ResettableAccount | null> => {
  const normalizedEmail = normalizeEmail(email);
  const [admin, user] = await Promise.all([
    AdminModel.findOne({ email: normalizedEmail }),
    UserModel.findOne({ email: normalizedEmail }),
  ]);

  return (admin ?? user) as ResettableAccount | null;
};

export const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, role, phone, gstNumber }: SignupBody & { phone?: string; gstNumber?: string } = req.body || {};

    if (!name || !email || !password) {
      throw new AppError('Name, email, and password are required', 400);
    }

    if (!phone || !phone.trim()) {
      throw new AppError('Phone number is required', 400);
    }

    const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const sanitizedGst = gstNumber ? gstNumber.trim().toUpperCase() : null;
    if (sanitizedGst && !GST_REGEX.test(sanitizedGst)) {
      throw new AppError('Invalid GST number format', 400);
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
      : await UserModel.create({ name, email: normalizedEmail, passwordHash, phone: phone.trim(), gstNumber: sanitizedGst });

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

export const requestPasswordResetOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email }: ForgotPasswordBody = req.body || {};
    if (!email) {
      throw new AppError('Email is required', 400);
    }

    const account = await findResettableAccountByEmail(email);
    if (!account || account.isBlocked) {
      res.json({
        success: true,
        message: genericForgotPasswordMessage,
        data: {
          expiresInSeconds: PASSWORD_RESET_OTP_EXPIRES_MINUTES * 60,
          resendAfterSeconds: PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
        },
      });
      return;
    }

    const now = Date.now();
    const lastSentAt = account.passwordResetLastSentAt?.getTime();
    if (lastSentAt && now - lastSentAt < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000) {
      res.json({
        success: true,
        message: genericForgotPasswordMessage,
        data: {
          expiresInSeconds: PASSWORD_RESET_OTP_EXPIRES_MINUTES * 60,
          resendAfterSeconds: Math.max(
            1,
            Math.ceil((PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000 - (now - lastSentAt)) / 1000)
          ),
        },
      });
      return;
    }

    const otp = generateNumericOtp();
    const expiresAt = new Date(now + PASSWORD_RESET_OTP_EXPIRES_MINUTES * 60 * 1000);

    account.passwordResetOtpHash = hashOtp(otp);
    account.passwordResetOtpExpiresAt = expiresAt;
    account.passwordResetLastSentAt = new Date(now);
    account.passwordResetAttemptCount = 0;
    await account.save();

    await sendPasswordResetOtpEmail(
      account.email,
      account.name,
      otp,
      PASSWORD_RESET_OTP_EXPIRES_MINUTES
    );

    logger.info('Password reset OTP generated', { accountId: account.id });

    res.json({
      success: true,
      message: genericForgotPasswordMessage,
      data: {
        expiresInSeconds: PASSWORD_RESET_OTP_EXPIRES_MINUTES * 60,
        resendAfterSeconds: PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resetPasswordWithOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, otp, newPassword, confirmPassword }: ResetPasswordBody = req.body || {};

    if (!email || !otp || !newPassword || !confirmPassword) {
      throw new AppError('Email, OTP, new password, and confirm password are required', 400);
    }

    if (newPassword !== confirmPassword) {
      throw new AppError('Passwords do not match', 400);
    }

    if (newPassword.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    const account = await findResettableAccountByEmail(email);
    if (!account || account.isBlocked) {
      throw new AppError('Invalid or expired OTP', 400);
    }

    if (
      !account.passwordResetOtpHash ||
      !account.passwordResetOtpExpiresAt ||
      account.passwordResetOtpExpiresAt.getTime() < Date.now()
    ) {
      clearPasswordResetState(account);
      await account.save();
      throw new AppError('OTP has expired. Please request a new one.', 400);
    }

    if ((account.passwordResetAttemptCount ?? 0) >= PASSWORD_RESET_MAX_ATTEMPTS) {
      clearPasswordResetState(account);
      await account.save();
      throw new AppError('Too many invalid attempts. Please request a new OTP.', 429);
    }

    const isValidOtp = hashOtp(otp) === account.passwordResetOtpHash;
    if (!isValidOtp) {
      account.passwordResetAttemptCount = (account.passwordResetAttemptCount ?? 0) + 1;
      await account.save();
      throw new AppError('Invalid or expired OTP', 400);
    }

    account.passwordHash = await hashPassword(newPassword);
    clearPasswordResetState(account);
    await account.save();

    logger.info('Password reset completed', { accountId: account.id });

    res.json({
      success: true,
      message: 'Password reset successful. Please sign in with your new password.',
    });
  } catch (error) {
    next(error);
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
