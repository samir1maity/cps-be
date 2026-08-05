import mongoose, { type InferSchemaType } from 'mongoose';

const querySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    type: { type: String, enum: ['review', 'query'], required: true },
    message: { type: String, required: true, trim: true },
    // Queries use: unread → read → resolved
    // Reviews use: pending → approved | rejected
    status: { type: String, enum: ['unread', 'read', 'resolved', 'pending', 'approved', 'rejected'], default: 'unread' },
    adminNote: { type: String, trim: true },
    featuredOnHome: { type: Boolean, default: false },
  },
  { timestamps: true }
);

querySchema.index({ status: 1, createdAt: -1 });

export type Query = InferSchemaType<typeof querySchema>;

const QueryModel = mongoose.model('Query', querySchema);
export default QueryModel;
