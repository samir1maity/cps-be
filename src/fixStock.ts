import mongoose from 'mongoose';
import { config } from './config/env.js';

await mongoose.connect(config.MONGO_URI);

const Product = mongoose.connection.collection('products');

const [r1, r2] = await Promise.all([
  Product.updateMany({ stockQuantity: 0, inStock: true },          { $set: { inStock: false } }),
  Product.updateMany({ stockQuantity: { $gt: 0 }, inStock: false }, { $set: { inStock: true } }),
]);

console.log(`Fixed: ${r1.modifiedCount} marked out-of-stock, ${r2.modifiedCount} marked in-stock`);
await mongoose.disconnect();
