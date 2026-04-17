/**
 * Provider-agnostic storage abstraction.
 *
 * The bucket / container is PRIVATE — no object is ever publicly readable.
 * All access is mediated through short-lived pre-signed URLs generated here.
 *
 * Only file *keys* (relative paths) are stored in the database.
 * URLs are generated on-demand and never persisted.
 *
 * To add a new provider (GCS, Azure Blob, …):
 *   1. Implement this interface.
 *   2. Register it in `storage/index.ts`.
 *   3. Set STORAGE_PROVIDER=<name> in .env — no other code changes needed.
 */
export interface StorageProvider {
  /**
   * Generate a pre-signed PUT URL the browser can use to upload a file
   * directly to the storage provider — no AWS credentials reach the client.
   *
   * @param key        Storage key (e.g. "products/1234-mug.jpg")
   * @param mimeType   Content-Type the client must set on the PUT request
   * @param expiresIn  Seconds until the URL expires (default: provider default)
   * @returns          { uploadUrl, key }
   */
  getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn?: number,
  ): Promise<string>;

  /**
   * Generate a pre-signed GET URL that grants temporary read access to a
   * private object.  Never expose the raw key to the browser — always
   * return a signed URL so the bucket stays private.
   *
   * @param key       Storage key stored in the DB
   * @param expiresIn Seconds until the URL expires
   */
  getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Permanently delete the object at `key`.
   * Must not throw when the object does not exist (idempotent).
   */
  delete(key: string): Promise<void>;
}
