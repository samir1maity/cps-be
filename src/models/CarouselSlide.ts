import mongoose, { type InferSchemaType } from 'mongoose';

const carouselSlideSchema = new mongoose.Schema(
  {
    imageKey: { type: String, default: '' },
    bgColor: { type: String, default: '' },
    ctaLink: { type: String, trim: true, default: '' },
    order: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

carouselSlideSchema.index({ order: 1 });

export type CarouselSlideDoc = InferSchemaType<typeof carouselSlideSchema>;

const CarouselSlideModel = mongoose.model('CarouselSlide', carouselSlideSchema);
export default CarouselSlideModel;
