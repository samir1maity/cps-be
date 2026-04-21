import type { ClientSession } from 'mongoose';
import { config } from '../config/env.js';
import PaymentAuditLogModel from '../models/PaymentAuditLog.js';

type AuditScope = 'PAYMENT' | 'ORDER' | 'REFUND';
type AuditLevel = 'INFO' | 'WARN' | 'ERROR';

interface RecordAuditLogInput {
  scope: AuditScope;
  event: string;
  level?: AuditLevel;
  message: string;
  orderId?: string;
  userId?: string;
  paymentId?: string;
  razorpayOrderId?: string;
  refundId?: string;
  meta?: Record<string, unknown>;
  session?: ClientSession;
}

const META_MAX_ENTRIES = 10;
const META_VALUE_MAX_LENGTH = 160;
const SENSITIVE_META_KEYS = ['signature', 'secret', 'token', 'password', 'authorization'];

const normalizeMetaValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, META_VALUE_MAX_LENGTH);
};

const sanitizeMeta = (meta?: Record<string, unknown>): Record<string, string> | undefined => {
  if (!meta) {
    return undefined;
  }

  const entries = Object.entries(meta)
    .filter(([key]) => !SENSITIVE_META_KEYS.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey)))
    .slice(0, META_MAX_ENTRIES)
    .flatMap(([key, value]) => {
      const normalizedValue = normalizeMetaValue(value);
      return normalizedValue ? [[key, normalizedValue] as const] : [];
    });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const getExpiryDate = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.PAYMENT_LOG_RETENTION_DAYS);
  return expiresAt;
};

const trimOrderLogHistory = async (orderId?: string): Promise<void> => {
  if (!orderId) {
    return;
  }

  const excessLogs = await PaymentAuditLogModel.find({ order: orderId })
    .sort({ createdAt: -1 })
    .skip(config.PAYMENT_LOG_MAX_PER_ORDER)
    .select('_id')
    .lean();

  if (excessLogs.length > 0) {
    await PaymentAuditLogModel.deleteMany({ _id: { $in: excessLogs.map((log) => log._id) } });
  }
};

export const recordAuditLog = async ({
  scope,
  event,
  level = 'INFO',
  message,
  orderId,
  userId,
  paymentId,
  razorpayOrderId,
  refundId,
  meta,
  session,
}: RecordAuditLogInput): Promise<void> => {
  await PaymentAuditLogModel.create([{
    scope,
    event,
    level,
    message,
    order: orderId,
    user: userId,
    paymentId,
    razorpayOrderId,
    refundId,
    meta: sanitizeMeta(meta),
    expiresAt: getExpiryDate(),
  }], { session });

  await trimOrderLogHistory(orderId);
};
