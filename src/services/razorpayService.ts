import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { AppError } from '../middlewares/errorHandler.js';

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

export const isRazorpayEnabled = (): boolean =>
  Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);

export interface RazorpayOrderOptions {
  amount: number; // in paise (INR smallest unit)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export const createRazorpayOrder = async (options: RazorpayOrderOptions) => {
  const order = await getRazorpay().orders.create({
    amount: options.amount,
    currency: options.currency || 'INR',
    receipt: options.receipt,
    notes: options.notes,
  });
  return order;
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
  return expectedSignature === signature;
};

export const initiateRefund = async (
  paymentId: string,
  amount: number,
  notes?: Record<string, string>
) => {
  const refund = await getRazorpay().payments.refund(paymentId, {
    amount,
    notes,
  });
  return refund;
};

export const getPayment = async (paymentId: string) => {
  return getRazorpay().payments.fetch(paymentId);
};
