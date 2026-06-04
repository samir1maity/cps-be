import mongoose, { type InferSchemaType } from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ parentId: 1 });
categorySchema.index({ sortOrder: 1 });

export type Category = InferSchemaType<typeof categorySchema>;

const CategoryModel = mongoose.model('Category', categorySchema);
export default CategoryModel;
