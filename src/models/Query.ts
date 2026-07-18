import mongoose, { type InferSchemaType } from 'mongoose';

const querySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    type: { type: String, enum: ['review', 'query'], required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['unread', 'read', 'resolved'], default: 'unread' },
    adminNote: { type: String, trim: true },
  },
  { timestamps: true }
);

querySchema.index({ status: 1, createdAt: -1 });

export type Query = InferSchemaType<typeof querySchema>;

const QueryModel = mongoose.model('Query', querySchema);
export default QueryModel;
