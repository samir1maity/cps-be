import mongoose, { type InferSchemaType } from 'mongoose';

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true }
);

export type Wishlist = InferSchemaType<typeof wishlistSchema>;

const WishlistModel = mongoose.model('Wishlist', wishlistSchema);
export default WishlistModel;
