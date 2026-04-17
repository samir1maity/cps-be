/**
 * Storage factory.
 *
 * Returns a singleton StorageProvider chosen by the STORAGE_PROVIDER env var.
 * All business logic imports from this file only — never from a specific
 * provider module — so swapping backends requires only an env-var change.
 *
 * Supported values of STORAGE_PROVIDER:
 *   s3   → Amazon S3 (private bucket, pre-signed URLs)  [default]
 *   (add further cases below when new providers are implemented)
 *
 * The bucket is PRIVATE.  Objects are never publicly readable.
 * All access goes through short-lived pre-signed URLs issued by the backend.
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
