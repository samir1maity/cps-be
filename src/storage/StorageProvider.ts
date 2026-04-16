/**
 * Abstraction over any object-storage backend.
 *
 * Only file *keys* (relative paths) are ever stored in the database.
 * Full public URLs are constructed at read-time via `resolveUrl()`.
 *
 * To add a new provider (GCS, Azure Blob, …):
 *   1. Implement this interface.
 *   2. Register it in `storage/index.ts`.
 *   3. Set STORAGE_PROVIDER=<name> in .env — no other code changes needed.
 */
export interface StorageProvider {
  /**
   * Upload a file buffer and return the storage key (not a URL).
   * @param key      Relative path inside the bucket / container (e.g. "products/abc.jpg")
   * @param buffer   Raw file bytes
   * @param mimeType MIME type of the file (e.g. "image/jpeg")
   */
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;

  /**
   * Permanently delete the object at `key`.
   * Should not throw when the object does not exist.
   */
  delete(key: string): Promise<void>;

  /**
   * Build the public-facing URL for `key`.
   * The base URL is provider-specific (e.g. S3 bucket URL, CDN origin).
   */
  resolveUrl(key: string): string;
}
