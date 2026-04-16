/**
 * @deprecated Import from `storage/index.ts` instead.
 *
 * This module is kept for backward compatibility only.
 * All new code must use the provider-agnostic `storage` singleton
 * and `resolveUrl` / `extractKey` helpers from `../storage/index.js`.
 */
export { storage as s3, resolveUrl, extractKey } from '../storage/index.js';
