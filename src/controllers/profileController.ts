import { type Response, type NextFunction } from 'express';
import UserModel from '../models/User.js';
import AddressModel from '../models/Address.js';
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
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
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

// ─── Addresses ────────────────────────────────────────────────────────────────

export const getAddresses = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addresses = await AddressModel.find({ user: req.user!.sub }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, data: addresses });
  } catch (error) {
    next(error);
  }
};

export const addAddress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { label, firstName, lastName, address1, address2, city, state, zipCode, country, phone, isDefault } = req.body;

    const required = ['firstName', 'lastName', 'address1', 'city', 'state', 'zipCode', 'country', 'phone'];
    for (const field of required) {
      if (!req.body[field]) throw new AppError(`${field} is required`, 400);
    }

    if (isDefault) {
      await AddressModel.updateMany({ user: req.user!.sub }, { isDefault: false });
    }

    const address = await AddressModel.create({
      user: req.user!.sub,
      label,
      firstName,
      lastName,
      address1,
      address2,
      city,
      state,
      zipCode,
      country,
      phone,
      isDefault: !!isDefault,
    });

    res.status(201).json({ success: true, data: address });
  } catch (error) {
    next(error);
  }
};

export const updateAddress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const address = await AddressModel.findOne({ _id: req.params.addressId, user: req.user!.sub });
    if (!address) throw new AppError('Address not found', 404);

    if (req.body.isDefault) {
      await AddressModel.updateMany({ user: req.user!.sub }, { isDefault: false });
    }

    const allowed = ['label', 'firstName', 'lastName', 'address1', 'address2', 'city', 'state', 'zipCode', 'country', 'phone', 'isDefault'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) (address as any)[key] = req.body[key];
    }

    await address.save();
    res.json({ success: true, data: address });
  } catch (error) {
    next(error);
  }
};

export const deleteAddress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const address = await AddressModel.findOneAndDelete({ _id: req.params.addressId, user: req.user!.sub });
    if (!address) throw new AppError('Address not found', 404);
    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    next(error);
  }
};
