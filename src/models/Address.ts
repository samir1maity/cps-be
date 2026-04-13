import mongoose, { type InferSchemaType } from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true }, // e.g. "Home", "Office"
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
  },
  { timestamps: true }
);

export type Address = InferSchemaType<typeof addressSchema>;

const AddressModel = mongoose.model('Address', addressSchema);
export default AddressModel;
