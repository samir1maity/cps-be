import mongoose, { type InferSchemaType } from 'mongoose';

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export type Admin = InferSchemaType<typeof adminSchema>;

const AdminModel = mongoose.model('Admin', adminSchema);
export default AdminModel;
