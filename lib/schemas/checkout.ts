import { z } from 'zod';
import {
  CoordinatesSchema,
  ShippingAddressSchema,
  CheckoutPayloadSchema,
  type Coordinates,
  type ValidatedShippingAddress,
  type ValidatedCheckoutPayload,
} from '@/types/validation/order';

export const FULFILLMENT_METHODS = ['delivery', 'handshake'] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];

export const PAYMENT_METHODS = ['cod', 'card'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHODS)[number];

export const CheckoutFormSchema = z.object({
  fulfillment: z.enum(FULFILLMENT_METHODS, {
    required_error: 'Please choose a fulfillment method',
  }),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    required_error: 'Please select a payment method',
  }),
});

export type CheckoutFormValues = z.infer<typeof CheckoutFormSchema>;

export {
  CoordinatesSchema,
  ShippingAddressSchema,
  CheckoutPayloadSchema,
  type Coordinates,
  type ValidatedShippingAddress,
  type ValidatedCheckoutPayload,
};
