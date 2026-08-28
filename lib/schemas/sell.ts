import { z } from 'zod';
import type { Category, Condition, Gender } from '@/types';
import { hasSubcategories } from '@/lib/categories';

export const CATEGORY_VALUES: [Category, ...Category[]] = [
  'clothing',
  'shoes',
  'bags',
  'accessories',
  'electronics',
  'beauty',
  'other',
];

export const CONDITION_VALUES: [Condition, ...Condition[]] = [
  'new_with_tags',
  'like_new',
  'good',
  'fair',
];

export const GENDER_VALUES: [Gender, ...Gender[]] = [
  'women',
  'men',
  'unisex',
];

export const PARCEL_SIZE_VALUES = ['small', 'medium', 'large'] as const;
export type ParcelSize = (typeof PARCEL_SIZE_VALUES)[number];

export const SellFormSchema = z
  .object({
    slots: z
      .array(z.any())
      .min(1, 'Please add at least one photo of the item'),
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(80, 'Title cannot exceed 80 characters'),
    description: z
      .string()
      .max(1000, 'Description cannot exceed 1000 characters'),
    price: z
      .string({ required_error: 'Price is required' })
      .trim()
      .min(1, 'Price is required')
      .refine(
        (val) => {
          const num = parseFloat(val);
          return !Number.isNaN(num) && num > 0;
        },
        'Enter a valid price greater than $0',
      )
      .refine(
        (val) => {
          const num = parseFloat(val);
          return Number.isFinite(num) && num <= 100000;
        },
        'Price cannot exceed $100,000',
      )
      .refine(
        (val) => {
          const regex = /^\d+(\.\d{1,2})?$/;
          return regex.test(val);
        },
        'Price can have at most 2 decimal places',
      ),
    category: z.enum(CATEGORY_VALUES, {
      required_error: 'Please choose a category',
    }),
    subcategory: z.string().nullable(),
    brand: z
      .string()
      .max(60, 'Brand cannot exceed 60 characters'),
    size: z
      .string()
      .max(30, 'Size cannot exceed 30 characters'),
    condition: z.enum(CONDITION_VALUES, {
      required_error: 'Please select a condition',
    }),
    color: z.string().nullable(),
    gender: z.enum(GENDER_VALUES, {
      required_error: 'Please select a target gender',
    }),
    tags: z
      .array(z.string())
      .max(10, 'Maximum 10 tags allowed'),
    parcelSize: z.enum(PARCEL_SIZE_VALUES).nullable(),
  })
  .superRefine((data, ctx) => {
    if (hasSubcategories(data.category) && !data.subcategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please choose a subcategory for this item',
        path: ['subcategory'],
      });
    }
  });

export type SellFormValues = z.infer<typeof SellFormSchema>;
