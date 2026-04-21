import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { AppError } from '../middlewares/errorHandler.js';
import logger from '../utils/logger.js';

// Lazy singleton — only instantiated when keys are present and a function is called.
let _razorpay: Razorpay | null = null;

const getRazorpay = (): Razorpay => {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new AppError('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env', 503);
  }
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

const safeCompareSignature = (expectedHex: string, receivedHex: string): boolean => {
  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const receivedBuffer = Buffer.from(receivedHex, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

export const isRazorpayEnabled = (): boolean =>
  Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);

export interface RazorpayOrderOptions {
  amount: number; // in paise (INR smallest unit)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

const ensurePositiveAmount = (amount: number): void => {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new AppError('Invalid payment amount', 400);
  }
};

const mapRazorpayError = (error: unknown, fallbackMessage: string): AppError => {
  const candidate = error as {
    error?: { description?: string };
    description?: string;
    message?: string;
    statusCode?: number;
    status?: number;
  };
  const providerMessage =
    candidate?.error?.description ??
    candidate?.description ??
    candidate?.message ??
    fallbackMessage;
  const statusCode = candidate?.statusCode ?? candidate?.status ?? 502;

  logger.error('Razorpay API request failed', { fallbackMessage, providerMessage, statusCode, error });
  return new AppError(providerMessage, statusCode >= 400 && statusCode < 600 ? statusCode : 502);
};

export const createRazorpayOrder = async (options: RazorpayOrderOptions) => {
  ensurePositiveAmount(options.amount);

  try {
    const order = await getRazorpay().orders.create({
      amount: options.amount,
      currency: options.currency || 'INR',
      receipt: options.receipt,
      notes: options.notes,
    });
    return order;
  } catch (error) {
    throw mapRazorpayError(error, 'Unable to create Razorpay order');
  }
};

export const verifyRazorpaySignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string
): boolean => {
  if (!config.RAZORPAY_KEY_SECRET) return false;
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return safeCompareSignature(expectedSignature, signature);
};

export const verifyRazorpayWebhookSignature = (
  rawBody: Buffer,
  signature: string
): boolean => {
  if (!config.RAZORPAY_WEBHOOK_SECRET) return false;

  const expectedSignature = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return safeCompareSignature(expectedSignature, signature);
};

export const initiateRefund = async (
  paymentId: string,
  amount: number,
  notes?: Record<string, string>
) => {
  ensurePositiveAmount(amount);

  try {
    const refund = await getRazorpay().payments.refund(paymentId, {
      amount,
      notes,
    });
    return refund;
  } catch (error) {
    throw mapRazorpayError(error, 'Unable to initiate refund');
  }
};

export const getPayment = async (paymentId: string) => {
  try {
    return getRazorpay().payments.fetch(paymentId);
  } catch (error) {
    throw mapRazorpayError(error, 'Unable to fetch Razorpay payment');
  }
};
