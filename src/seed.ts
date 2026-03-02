import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import UserModel from './models/User.js';
import AdminModel from './models/Admin.js';
import CategoryModel from './models/Category.js';
import ProductModel from './models/Product.js';
import CouponModel from './models/Coupon.js';
import { hashPassword } from './utils/password.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/creative-ecom';

const seed = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB for seeding...');

  // Clear existing data
  await Promise.all([
    CategoryModel.deleteMany({}),
    ProductModel.deleteMany({}),
    CouponModel.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  // Create admin user if not exists
  const adminEmail = 'admin@creativepottery.com';
  const existingAdmin = await AdminModel.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await AdminModel.create({
      name: 'Admin',
      email: adminEmail,
      passwordHash: await hashPassword('Admin@123'),
    });
    console.log('Admin created: admin@creativepottery.com / Admin@123');
  }

  // Create test user if not exists
  const userEmail = 'user@creativepottery.com';
  const existingUser = await UserModel.findOne({ email: userEmail });
  if (!existingUser) {
    await UserModel.create({
      name: 'Test User',
      email: userEmail,
      passwordHash: await hashPassword('User@123'),
    });
    console.log('Test user created: user@creativepottery.com / User@123');
  }

  // Categories
  const jewellery = await CategoryModel.create({ name: 'Jewellery', slug: 'jewellery', description: 'Handcrafted ceramic jewellery' });
  const mugs = await CategoryModel.create({ name: 'Cups & Mugs', slug: 'cups-mugs', description: 'Handcrafted pottery cups and mugs' });
  const serverware = await CategoryModel.create({ name: 'Serverware', slug: 'serverware', description: 'Elegant pottery serverware' });
  const dinnerware = await CategoryModel.create({ name: 'Dinnerware', slug: 'dinnerware', description: 'Complete pottery dinnerware sets' });
  const decor = await CategoryModel.create({ name: 'Decor Items', slug: 'decor-items', description: 'Pottery home decor' });
  const utility = await CategoryModel.create({ name: 'Utility Items', slug: 'utility-items', description: 'Functional pottery items' });
  const artworks = await CategoryModel.create({ name: 'Artworks', slug: 'artworks', description: 'Pottery artworks and sculptures' });
  const workshops = await CategoryModel.create({ name: 'Workshops', slug: 'workshops', description: 'Pottery workshop kits' });

  // Subcategories
  const earrings = await CategoryModel.create({ name: 'Earrings', slug: 'earrings', parentId: jewellery._id });
  const pendants = await CategoryModel.create({ name: 'Pendants', slug: 'pendants', parentId: jewellery._id });
  const teaCups = await CategoryModel.create({ name: 'Tea Cups', slug: 'tea-cups', parentId: mugs._id });
  const coffeeMugs = await CategoryModel.create({ name: 'Coffee Mugs', slug: 'coffee-mugs', parentId: mugs._id });

  console.log('Categories created');

  // Products
  const products = await ProductModel.insertMany([
    {
      name: 'Handcrafted Ceramic Earrings - Floral',
      description: 'Beautiful handcrafted ceramic earrings with floral design. Each pair is unique and made with love.',
      price: 799,
      originalPrice: 1199,
      images: [
        'https://images.unsplash.com/photo-1635767798638-3e25273a8236?w=500',
        'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=500',
      ],
      category: jewellery._id,
      subcategory: earrings._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 25,
      inStock: true,
      tags: ['earrings', 'ceramic', 'handmade', 'floral'],
      specifications: new Map([['Material', 'Ceramic'], ['Finish', 'Glazed'], ['Care', 'Avoid water']]),
    },
    {
      name: 'Lotus Pendant Necklace',
      description: 'Elegant ceramic lotus pendant, symbolizing purity and grace. Handcrafted by skilled artisans.',
      price: 1299,
      originalPrice: 1799,
      images: [
        'https://images.unsplash.com/photo-1619119069152-a2b331eb392a?w=500',
      ],
      category: jewellery._id,
      subcategory: pendants._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 15,
      inStock: true,
      tags: ['pendant', 'ceramic', 'lotus', 'necklace'],
      specifications: new Map([['Material', 'Ceramic'], ['Chain', 'Sterling Silver Plated'], ['Size', '3cm diameter']]),
    },
    {
      name: 'Artisan Tea Cup Set - Blue Glaze',
      description: 'Stunning set of 2 handcrafted tea cups with blue glaze. Perfect for your daily tea ritual.',
      price: 1499,
      originalPrice: 2000,
      images: [
        'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=500',
      ],
      category: mugs._id,
      subcategory: teaCups._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 30,
      inStock: true,
      tags: ['tea cup', 'blue glaze', 'handmade', 'set'],
      specifications: new Map([['Capacity', '150ml'], ['Set', '2 pieces'], ['Dishwasher Safe', 'No']]),
    },
    {
      name: 'Large Coffee Mug - Earth Tones',
      description: 'A generous 350ml coffee mug in warm earth tones. Microwave safe and food grade ceramic.',
      price: 899,
      originalPrice: 1200,
      images: [
        'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500',
      ],
      category: mugs._id,
      subcategory: coffeeMugs._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 40,
      inStock: true,
      tags: ['coffee mug', 'earth tones', 'large', 'microwave safe'],
      specifications: new Map([['Capacity', '350ml'], ['Microwave Safe', 'Yes'], ['Material', 'Stoneware']]),
    },
    {
      name: 'Pottery Serving Bowl - Terracotta',
      description: 'Large terracotta serving bowl perfect for salads, fruits, and family meals.',
      price: 2499,
      originalPrice: 3500,
      images: [
        'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=500',
      ],
      category: serverware._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 20,
      inStock: true,
      tags: ['serving bowl', 'terracotta', 'large', 'food safe'],
      specifications: new Map([['Diameter', '30cm'], ['Material', 'Terracotta'], ['Food Safe', 'Yes']]),
    },
    {
      name: 'Handmade Dinner Plate Set',
      description: 'Set of 4 handmade dinner plates with unique glaze patterns. No two are exactly alike.',
      price: 4999,
      originalPrice: 7000,
      images: [
        'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=500',
      ],
      category: dinnerware._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 12,
      inStock: true,
      tags: ['dinner plate', 'set of 4', 'handmade', 'glaze'],
      specifications: new Map([['Set', '4 pieces'], ['Diameter', '26cm'], ['Dishwasher Safe', 'No']]),
    },
    {
      name: 'Ceramic Vase - Minimalist White',
      description: 'Elegant minimalist white ceramic vase, perfect for dried or fresh flowers.',
      price: 1799,
      originalPrice: 2400,
      images: [
        'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500',
      ],
      category: decor._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 35,
      inStock: true,
      tags: ['vase', 'white', 'minimalist', 'decor'],
      specifications: new Map([['Height', '25cm'], ['Material', 'Ceramic'], ['Waterproof', 'Yes']]),
    },
    {
      name: 'Pottery Workshop Starter Kit',
      description: 'Complete starter kit for pottery beginners. Includes clay, tools, and instruction booklet.',
      price: 2999,
      images: [
        'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=500',
      ],
      category: workshops._id,
      brand: 'Creative Pottery Studio',
      stockQuantity: 50,
      inStock: true,
      tags: ['workshop', 'kit', 'beginner', 'diy'],
      specifications: new Map([['Contents', 'Clay, Tools, Guide'], ['Difficulty', 'Beginner'], ['Age', '12+']]),
    },
  ]);

  console.log(`${products.length} products created`);

  // Coupons
  await CouponModel.insertMany([
    {
      code: 'WELCOME10',
      type: 'PERCENTAGE',
      value: 10,
      minOrderAmount: 500,
      maxDiscountAmount: 200,
      usageLimit: 100,
      isActive: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    {
      code: 'FLAT100',
      type: 'FIXED',
      value: 100,
      minOrderAmount: 1000,
      usageLimit: 50,
      isActive: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  ]);
  console.log('Coupons created: WELCOME10, FLAT100');

  console.log('\n✅ Seed completed successfully!');
  console.log('Admin: admin@creativepottery.com / Admin@123');
  console.log('User:  user@creativepottery.com / User@123');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
