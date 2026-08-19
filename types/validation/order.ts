import { z } from 'zod';

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const ShippingAddressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(2, 'Recipient name must be at least 2 characters')
    .max(80, 'Recipient name must not exceed 80 characters'),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 digits')
    .max(30, 'Phone number must not exceed 30 digits'),
  line1: z
    .string()
    .trim()
    .min(3, 'Address line 1 must be at least 3 characters')
    .max(120, 'Address line 1 must not exceed 120 characters'),
  line2: z
    .string()
    .trim()
    .max(120, 'Address line 2 must not exceed 120 characters')
    .optional()
    .nullable()
    .transform((val) => val || null),
  city: z
    .string()
    .trim()
    .min(2, 'City is required')
    .max(60, 'City must not exceed 60 characters'),
  state: z
    .string()
    .trim()
    .min(2, 'State / region is required')
    .max(60, 'State must not exceed 60 characters'),
  postalCode: z
    .string()
    .trim()
    .min(2, 'Postal code is required')
    .max(20, 'Postal code must not exceed 20 characters'),
  country: z
    .string()
    .trim()
    .min(2, 'Country is required')
    .max(60, 'Country must not exceed 60 characters'),
  deliveryInstructions: z
    .string()
    .trim()
    .max(300, 'Delivery instructions must not exceed 300 characters')
    .optional()
    .nullable()
    .transform((val) => val || null),
  coordinates: CoordinatesSchema.optional().nullable().transform((val) => val || null),
});

export type ValidatedShippingAddress = z.infer<typeof ShippingAddressSchema>;

export const CheckoutPayloadSchema = z.object({
  listingId: z.string().uuid('Invalid listing ID'),
  buyerId: z.string().uuid('Invalid buyer ID'),
  paymentMethod: z.enum(['cod', 'card']),
  shippingAddress: ShippingAddressSchema,
  offerAmount: z.number().positive().optional().nullable(),
  deliveryNotes: z.string().max(300).optional().nullable(),
});

export type ValidatedCheckoutPayload = z.infer<typeof CheckoutPayloadSchema>;
