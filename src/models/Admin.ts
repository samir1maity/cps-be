import mongoose, { type InferSchemaType } from 'mongoose';

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    passwordResetOtpHash: { type: String },
    passwordResetOtpExpiresAt: { type: Date },
    passwordResetLastSentAt: { type: Date },
    passwordResetAttemptCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type Admin = InferSchemaType<typeof adminSchema>;

const AdminModel = mongoose.model('Admin', adminSchema);
export default AdminModel;
