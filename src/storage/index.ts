/**
 * Storage factory.
 *
 * Reads STORAGE_PROVIDER from env and returns a singleton StorageProvider.
 * Business logic only ever imports from this file — never from a specific
 * provider module — so swapping backends requires only an env-var change.
 *
 * Supported values:
 *   s3   → Amazon S3  (default)
 *   (add more cases below when new providers are implemented)
 */
import { config } from '../config/env.js';
import { S3StorageProvider } from './S3StorageProvider.js';
import type { StorageProvider } from './StorageProvider.js';

function createProvider(): StorageProvider {
  switch (config.STORAGE_PROVIDER) {
    case 's3':
    default:
      return new S3StorageProvider();
  }
}

/** Singleton storage provider — shared across the whole process. */
export const storage: StorageProvider = createProvider();

/**
 * Resolve a stored key to a full public URL.
 *
 * Usage:
 *   // In DB: product.images = ['products/abc.jpg']
 *   resolveUrl('products/abc.jpg')
 *   // → 'https://my-bucket.s3.ap-south-1.amazonaws.com/products/abc.jpg'
 *
 * Returns an empty string for falsy keys so callers can do:
 *   image: resolveUrl(product.imageKey) || null
 */
export const resolveUrl = (key: string | null | undefined): string =>
  key ? storage.resolveUrl(key) : '';

/**
 * Extract the storage key from a previously-resolved full URL.
 * Used when migrating old records that still store full URLs.
 *
 * e.g. 'https://bucket.s3.region.amazonaws.com/products/abc.jpg'
 *      → 'products/abc.jpg'
 */
export const extractKey = (urlOrKey: string): string => {
  try {
    const parsed = new URL(urlOrKey);
    // pathname starts with '/', drop it
    return parsed.pathname.replace(/^\//, '');
  } catch {
    // Not a URL — it's already a plain key
    return urlOrKey;
  }
};
