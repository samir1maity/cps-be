import mongoose, { type InferSchemaType } from 'mongoose';

const addressSchema = new mongoose.Schema({
  type: { type: String, enum: ['HOME', 'WORK', 'OTHER'], default: 'HOME' },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  address1: { type: String, required: true, trim: true },
  address2: { type: String, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  zipCode: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true },
    avatar: { type: String },
    addresses: [addressSchema],
    isBlocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof userSchema>;

const UserModel = mongoose.model('User', userSchema);
export default UserModel;
