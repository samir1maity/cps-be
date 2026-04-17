import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';
import type { StorageProvider } from './StorageProvider.js';

/**
 * Amazon S3 implementation — bucket is PRIVATE.
 *
 * - Uploads:   browser receives a pre-signed PUT URL from the backend and
 *              pushes the file directly to S3.  No file bytes pass through
 *              the backend server.
 * - Downloads: backend issues a short-lived pre-signed GET URL on demand.
 *              The raw bucket URL is never exposed.
 * - Credentials stay entirely on the server.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultExpiry: number;

  constructor() {
    this.client = new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
      // Newer SDK v3 versions inject x-amz-checksum-mode=ENABLED into
      // presigned GET URLs by default.  Objects that were uploaded without
      // a stored checksum cause S3 to return AccessDenied when this header
      // is present, so we disable it globally here.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.bucket = config.AWS_S3_BUCKET;
    this.defaultExpiry = config.PRESIGN_EXPIRES_IN;
  }

  /**
   * Return a pre-signed PUT URL.
   * The client must include `Content-Type: <mimeType>` on the PUT request —
   * S3 will reject the upload if it doesn't match the signed header.
   */
  async getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = this.defaultExpiry,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Return a pre-signed GET URL granting temporary read access to a private
   * object.  Use a short TTL (e.g. 15 min) for general display, longer for
   * download links.
   */
  async getSignedDownloadUrl(
    key: string,
    expiresIn: number = this.defaultExpiry,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // Swallow "key not found" — idempotent delete is intentional.
    }
  }
}
