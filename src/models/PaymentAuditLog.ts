import mongoose, { type InferSchemaType } from 'mongoose';

const paymentAuditLogSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ['PAYMENT', 'ORDER', 'REFUND'],
      required: true,
    },
    event: { type: String, required: true, trim: true, maxlength: 80 },
    level: {
      type: String,
      enum: ['INFO', 'WARN', 'ERROR'],
      default: 'INFO',
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    paymentId: { type: String, trim: true, maxlength: 64, index: true },
    razorpayOrderId: { type: String, trim: true, maxlength: 64, index: true },
    refundId: { type: String, trim: true, maxlength: 64, index: true },
    message: { type: String, required: true, trim: true, maxlength: 200 },
    meta: {
      type: Map,
      of: String,
      default: undefined,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

paymentAuditLogSchema.index({ createdAt: -1 });
paymentAuditLogSchema.index({ order: 1, createdAt: -1 });
paymentAuditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PaymentAuditLog = InferSchemaType<typeof paymentAuditLogSchema>;

const PaymentAuditLogModel = mongoose.model('PaymentAuditLog', paymentAuditLogSchema);
export default PaymentAuditLogModel;
