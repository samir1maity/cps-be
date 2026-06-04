import mongoose, { type InferSchemaType } from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  image: { type: String, default: '' },
  colorName: { type: String, default: null },
  // Stored so releaseInventory can restore the correct variant's stock on cancel/refund
  colorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
}, { _id: true });

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
      default: 'PENDING',
    },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    shippingAddress: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true },
    paymentMethod: {
      type: String,
      enum: ['RAZORPAY'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    paymentFailureReason: { type: String },
    trackingNumber: { type: String },
    notes: { type: String },
    couponCode: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });
orderSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });

export type Order = InferSchemaType<typeof orderSchema>;

const OrderModel = mongoose.model('Order', orderSchema);
export default OrderModel;
