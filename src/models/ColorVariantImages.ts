import mongoose, { type InferSchemaType } from 'mongoose';

/**
 * Stores the extra gallery images for one color variant of a product.
 * The primary thumbnail (imageKey) stays on the Product document — this
 * collection holds the additional images shown only on the product detail page.
 *
 * One document per (productId, colorId) pair.
 */
const colorVariantImagesSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    colorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    imageKeys: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Compound unique index — only one gallery doc per product+color pair.
colorVariantImagesSchema.index({ productId: 1, colorId: 1 }, { unique: true });

export type ColorVariantImages = InferSchemaType<typeof colorVariantImagesSchema>;

const ColorVariantImagesModel = mongoose.model('ColorVariantImages', colorVariantImagesSchema);
export default ColorVariantImagesModel;
