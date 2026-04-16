import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env.js';
import type { StorageProvider } from './StorageProvider.js';

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor() {
    this.client = new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.bucket = config.AWS_S3_BUCKET;

    // Allow a custom CDN / CloudFront URL; fall back to the canonical S3 endpoint.
    this.baseUrl =
      config.STORAGE_BASE_URL ||
      `https://${this.bucket}.s3.${config.AWS_REGION}.amazonaws.com`;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // Swallow "key not found" errors — idempotent delete is fine.
    }
  }

  resolveUrl(key: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${key}`;
  }
}
