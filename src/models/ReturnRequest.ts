import mongoose, { type InferSchemaType } from 'mongoose';

const returnRequestSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Which order item is being returned
    orderItem: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'REFUND_INITIATED', 'REFUND_COMPLETED', 'REFUND_FAILED'],
      default: 'PENDING',
    },
    adminNote: { type: String, trim: true },
    refundAmount: { type: Number, min: 0 },
    refundStatus: {
      type: String,
      enum: ['PENDING', 'INITIATED', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    razorpayRefundId: { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

returnRequestSchema.index({ order: 1 });
returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1 });

export type ReturnRequest = InferSchemaType<typeof returnRequestSchema>;

const ReturnRequestModel = mongoose.model('ReturnRequest', returnRequestSchema);
export default ReturnRequestModel;
