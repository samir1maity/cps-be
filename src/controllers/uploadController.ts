/**
 * Upload controller — two endpoints, zero bytes of file data.
 *
 * POST /api/v1/upload/presign
 *   Body: { folder, filename, mimeType }
 *   Returns: { uploadUrl, key }
 *   The browser PUTs the file directly to `uploadUrl` (signed S3 PUT).
 *   On success the browser sends `key` to the relevant resource endpoint
 *   (product, category, profile) — never the URL.
 *
 * GET /api/v1/upload/sign/:key(*)
 *   Returns: { url }
 *   Issues a short-lived signed GET URL so the browser can display a private
 *   object without exposing the raw bucket path or any credentials.
 */
import { type Response, type NextFunction } from 'express';
import { storage } from '../storage/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/authenticate.js';
import crypto from 'crypto';
import path from 'path';

// File extensions we allow to be uploaded through this endpoint.
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Maximum key length guard (prevents path-traversal and excessively long keys).
const MAX_KEY_LENGTH = 512;

// Maximum allowed file size for any upload (bytes).
const MAX_FILE_SIZE = 250 * 1024; // 250 KB

// Folder allowlist — callers cannot write to arbitrary prefixes.
const ALLOWED_FOLDERS = new Set(['products', 'categories', 'avatars']);

/**
 * POST /api/v1/upload/presign
 * Authenticated users only.  Admin-restricted folders (products, categories)
 * are enforced inside the handler.
 */
export const presignUpload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { folder, filename, mimeType, fileSize } = req.body as {
      folder?: string;
      filename?: string;
      mimeType?: string;
      fileSize?: number;
    };

    // ── Validation ────────────────────────────────────────────────────────────

    if (!folder || !filename || !mimeType || fileSize === undefined) {
      throw new AppError('folder, filename, mimeType, and fileSize are required', 400);
    }

    if (fileSize > MAX_FILE_SIZE) {
      throw new AppError(`File size must not exceed ${MAX_FILE_SIZE / 1024} KB`, 400);
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      throw new AppError(`folder must be one of: ${[...ALLOWED_FOLDERS].join(', ')}`, 400);
    }

    // Only admins may upload product and category images.
    if ((folder === 'products' || folder === 'categories') && req.user!.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new AppError('Only .jpg, .jpeg, .png and .webp files are allowed', 400);
    }

    if (!mimeType.startsWith('image/')) {
      throw new AppError('mimeType must be an image type', 400);
    }

    // ── Key generation ────────────────────────────────────────────────────────
    // Use a random UUID prefix to prevent collisions and make keys
    // unguessable — objects in a private bucket still shouldn't be
    // enumerable by pattern.
    const randomId = crypto.randomUUID();
    const safeName = path
      .basename(filename)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    const key = `${folder}/${randomId}-${safeName}`;

    // ── Issue signed PUT URL ──────────────────────────────────────────────────
    const uploadUrl = await storage.getSignedUploadUrl(key, mimeType);

    res.json({ success: true, data: { uploadUrl, key } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/upload/sign-batch
 * Body: { keys: string[] }  (max 50)
 * Returns: { results: Record<key, url> }
 * Resolves multiple storage keys to signed GET URLs in one round-trip.
 */
export const signDownloadBatch = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { keys } = req.body as { keys?: unknown };

    if (!Array.isArray(keys) || keys.length === 0) {
      throw new AppError('keys must be a non-empty array', 400);
    }
    if (keys.length > 50) {
      throw new AppError('Maximum 50 keys per batch', 400);
    }

    const invalid = keys.find(
      (k) => typeof k !== 'string' || !k || k.length > MAX_KEY_LENGTH || k.includes('..') || k.startsWith('/'),
    );
    if (invalid !== undefined) {
      throw new AppError('One or more keys are invalid', 400);
    }

    const entries = await Promise.all(
      (keys as string[]).map(async (key) => {
        const url = await storage.getSignedDownloadUrl(key);
        return [key, url] as const;
      }),
    );

    res.json({ success: true, data: { results: Object.fromEntries(entries) } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/upload/sign/:key(*)
 * Authenticated users only.
 * Returns a short-lived signed GET URL for a stored key.
 *
 * The `(*)` wildcard lets the key contain slashes (e.g. products/uuid-name.jpg).
 */
export const signDownload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // path-to-regexp v8 (Express 5): {/*key} captures everything after /sign/
    // into req.params.key, including slashes (e.g. "products/uuid-name.jpg").
    const raw = req.params.key;
    const key = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');

    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new AppError('Invalid key', 400);
    }

    // Guard against path traversal.
    if (key.includes('..') || key.startsWith('/')) {
      throw new AppError('Invalid key', 400);
    }

    const url = await storage.getSignedDownloadUrl(key);

    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
};
