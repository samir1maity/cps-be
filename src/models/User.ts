import mongoose, { type InferSchemaType } from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true },
    gstNumber: { type: String, trim: true, default: null },
    avatar: { type: String },
    isBlocked: { type: Boolean, default: false },
    passwordResetOtpHash: { type: String },
    passwordResetOtpExpiresAt: { type: Date },
    passwordResetLastSentAt: { type: Date },
    passwordResetAttemptCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof userSchema>;

const UserModel = mongoose.model('User', userSchema);
export default UserModel;
