import mongoose, { type InferSchemaType } from 'mongoose';

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
    event: { type: String, required: true, trim: true, maxlength: 80 },
    status: {
      type: String,
      enum: ['PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PROCESSING',
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    paymentId: { type: String, trim: true, maxlength: 64, index: true },
    processedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    lastError: { type: String, trim: true, maxlength: 200 },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

paymentWebhookEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PaymentWebhookEvent = InferSchemaType<typeof paymentWebhookEventSchema>;

const PaymentWebhookEventModel = mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);
export default PaymentWebhookEventModel;
