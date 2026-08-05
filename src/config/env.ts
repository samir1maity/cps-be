import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  MONGO_URI: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  FRONTEND_URL: string;
  CORS_ORIGINS: string;
  // Razorpay
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  PAYMENT_LOG_RETENTION_DAYS: number;
  PAYMENT_LOG_MAX_PER_ORDER: number;
  // Storage (provider-agnostic)
  STORAGE_PROVIDER: string;   // 's3' | future: 'gcs' | 'azure'
  PRESIGN_EXPIRES_IN: number; // seconds — lifetime of signed upload/download URLs
  // AWS S3
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_S3_BUCKET: string;
  // Email
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_USER: string;
  EMAIL_PASS: string;
  // Store identity — used in email from/reply headers and admin notifications
  STORE_NAME: string;        // e.g. "Creative Pottery Studio"
  STORE_EMAIL: string;       // inbox that receives new-order notifications (can differ from EMAIL_USER)
  STORE_ADMIN_EMAIL: string; // admin notification recipient (can be same as STORE_EMAIL)
}

const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config: EnvConfig = {
  PORT: Number(process.env.PORT || 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000',
  // Razorpay
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  PAYMENT_LOG_RETENTION_DAYS: Number(process.env.PAYMENT_LOG_RETENTION_DAYS || 30),
  PAYMENT_LOG_MAX_PER_ORDER: Number(process.env.PAYMENT_LOG_MAX_PER_ORDER || 25),
  // Storage
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 's3',
  PRESIGN_EXPIRES_IN: Number(process.env.PRESIGN_EXPIRES_IN || 900), // 15 min default
  // AWS S3
  AWS_REGION: process.env.AWS_REGION || 'ap-south-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || '',
  // Email
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: Number(process.env.EMAIL_PORT || 587),
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',
  // Store identity
  STORE_NAME: process.env.STORE_NAME || 'Creative Pottery Studio',
  STORE_EMAIL: process.env.STORE_EMAIL || process.env.EMAIL_USER || '',
  STORE_ADMIN_EMAIL: process.env.STORE_ADMIN_EMAIL || process.env.STORE_EMAIL || process.env.EMAIL_USER || '',
};
