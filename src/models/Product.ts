import mongoose, { type InferSchemaType } from 'mongoose';

const colorVariantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  imageKey: { type: String, required: true },
  stock: { type: Number, required: true, min: 0, default: 0 },
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
    // For color-variant products this is derived (sum of variant stocks) via pre-save.
    // For plain products it is set directly by the admin.
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    tags: [{ type: String, trim: true }],
    specifications: { type: Map, of: String, default: {} },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Keep stockQuantity and inStock in sync.
// For color-variant products: stockQuantity = sum of all variant stocks.
// For plain products: stockQuantity is managed directly by the admin.
productSchema.pre('save', function () {
  if (this.colors && this.colors.length > 0) {
    this.stockQuantity = this.colors.reduce((sum, c) => sum + (c.stock ?? 0), 0);
  }
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
