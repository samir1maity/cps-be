import mongoose, { type InferSchemaType } from 'mongoose';

const colorVariantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  imageKey: { type: String, required: true },
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    images: [{ type: String }],
    colors: { type: [colorVariantSchema], default: [] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    brand: { type: String, trim: true, default: 'Creative Pottery Studio' },
    inStock: { type: Boolean, default: true },
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    tags: [{ type: String, trim: true }],
    specifications: { type: Map, of: String, default: {} },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    // Aggregated from reviews
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

productSchema.pre('save', function () {
  this.inStock = this.stockQuantity > 0;
});

productSchema.index({ category: 1 });
productSchema.index({ subcategory: 1 });
productSchema.index({ inStock: 1 });
productSchema.index({ price: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

export type Product = InferSchemaType<typeof productSchema>;

const ProductModel = mongoose.model('Product', productSchema);
export default ProductModel;
