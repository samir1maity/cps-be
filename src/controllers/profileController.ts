import { type Response, type NextFunction } from 'express';
import UserModel from '../models/User.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { uploadToS3 } from '../services/s3Service.js';
import multer from 'multer';

const storage = multer.memoryStorage();
export const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  },
});

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user!.role !== 'user') {
      res.json({ success: true, data: { id: req.user!.sub, role: 'ADMIN' } });
      return;
    }
    const user = await UserModel.findById(req.user!.sub).select('-passwordHash');
    if (!user) throw new AppError('User not found', 404);

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        addresses: user.addresses,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, phone } = req.body;
    const updates: Record<string, any> = {};

    if (name) updates.name = name.trim();
    if (phone) updates.phone = phone.trim();

    if (req.file) {
      const key = `avatars/${req.user!.sub}-${Date.now()}`;
      updates.avatar = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    }

    const user = await UserModel.findByIdAndUpdate(req.user!.sub, updates, { new: true }).select('-passwordHash');
    if (!user) throw new AppError('User not found', 404);

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError('Current and new passwords are required', 400);
    if (newPassword.length < 8) throw new AppError('New password must be at least 8 characters', 400);

    const user = await UserModel.findById(req.user!.sub);
    if (!user) throw new AppError('User not found', 404);

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new AppError('Current password is incorrect', 401);

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

// Addresses
export const getAddresses = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.sub).select('addresses');
    if (!user) throw new AppError('User not found', 404);
    res.json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};

export const addAddress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, firstName, lastName, address1, address2, city, state, zipCode, country, phone, isDefault } = req.body;
    const required = ['firstName', 'lastName', 'address1', 'city', 'state', 'zipCode', 'country', 'phone'];
    for (const field of required) {
      if (!req.body[field]) throw new AppError(`${field} is required`, 400);
    }

    const user = await UserModel.findById(req.user!.sub);
    if (!user) throw new AppError('User not found', 404);

    if (isDefault) {
      // Remove existing default
      user.addresses.forEach((a: any) => { a.isDefault = false; });
    }

    user.addresses.push({ type, firstName, lastName, address1, address2, city, state, zipCode, country, phone, isDefault: !!isDefault } as any);
    await user.save();

    res.status(201).json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};

export const updateAddress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.sub);
    if (!user) throw new AppError('User not found', 404);

    const address = user.addresses.find((a: any) => a._id.toString() === req.params.addressId);
    if (!address) throw new AppError('Address not found', 404);

    if (req.body.isDefault) {
      user.addresses.forEach((a: any) => { a.isDefault = false; });
    }

    Object.assign(address, req.body);
    await user.save();

    res.json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};

export const deleteAddress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.sub);
    if (!user) throw new AppError('User not found', 404);

    user.addresses = user.addresses.filter((a: any) => a._id.toString() !== req.params.addressId) as any;
    await user.save();

    res.json({ success: true, data: user.addresses });
  } catch (error) {
    next(error);
  }
};
