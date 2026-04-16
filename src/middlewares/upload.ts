/**
 * Centralised multer configurations.
 *
 * All file uploads go through memory storage — the controller is responsible
 * for forwarding `req.file.buffer` to the storage layer.
 *
 * Keeping multer instances here prevents duplicate config scattered across
 * multiple controller files.
 */
import multer from 'multer';
import path from 'path';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const memoryStorage = multer.memoryStorage();

/** Product images — up to 10 files, 5 MB each, image extensions only. */
export const productImageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .jpg, .jpeg, .png and .webp files are allowed'));
    }
  },
});

/** Category image — single file, 5 MB, image extensions only. */
export const categoryImageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .jpg, .jpeg, .png and .webp files are allowed'));
    }
  },
});

/** User/admin avatar — single file, 2 MB, any image MIME. */
export const avatarUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});
