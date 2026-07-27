import mongoose, { type InferSchemaType } from 'mongoose';

const adminNotificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['NEW_ORDER', 'ORDER_CANCELLED', 'RETURN_REQUEST'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ isRead: 1, createdAt: -1 });

export type AdminNotification = InferSchemaType<typeof adminNotificationSchema>;

const AdminNotificationModel = mongoose.model('AdminNotification', adminNotificationSchema);
export default AdminNotificationModel;
