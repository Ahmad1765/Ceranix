export type Gender = 'all' | 'men' | 'women' | 'unisex';

export type Condition = 'new_with_tags' | 'like_new' | 'good' | 'fair';

export type Category =
  | 'clothing'
  | 'shoes'
  | 'bags'
  | 'accessories'
  | 'electronics'
  | 'beauty'
  | 'other';

export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  // Wide header image behind the avatar on the profile screens. Null on every
  // row created before the column existed — callers must render a fallback.
  banner_url?: string | null;
  full_name: string;
  bio: string | null;
  location: string | null;
  rating: number;
  total_sales: number;
  created_at: string;
  // Settings-driven fields (optional for backwards compat with existing reads)
  vacation_mode?: boolean;
  bundle_discount_pct?: number;
  is_verified?: boolean;
  is_pro?: boolean;
  followers_count?: number;
  following_count?: number;
  // Category slugs captured at onboarding (feed personalization, future use).
  interests?: string[] | null;
}

export interface ShippingAddress {
  id: string;
  user_id: string;
  recipient_name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
  coordinates?: { lat: number; lng: number } | null;
  delivery_instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'card' | 'cod';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'canceled'
  | 'refund_due'
  | 'failed';

// A row of public.orders — record of payments and Cash on Delivery orders.
export interface Order {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  stripe_session_id?: string | null;
  stripe_payment_intent?: string | null;
  offer_message_id?: string | null;
  payment_method?: PaymentMethod;
  status: OrderStatus;
  shipping_address?: ShippingAddress | null;
  delivery_notes?: string | null;
  created_at: string;
}

export type PayoutKind = 'bank' | 'wallet';

export interface PayoutMethod {
  id: string;
  user_id: string;
  kind: PayoutKind;
  label: string;
  account_last4: string;
  is_default: boolean;
  created_at: string;
}

export type VerificationStatus = 'submitted' | 'approved' | 'rejected';
export type DocumentKind = 'passport' | 'national_id' | 'drivers_license';

export interface Verification {
  user_id: string;
  status: VerificationStatus;
  legal_name: string;
  document_kind: DocumentKind;
  document_number_last4: string | null;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface Listing {
  id: string;
  seller_id: string;
  seller: User;
  title: string;
  description: string;
  price: number; // in USD
  category: Category;
  // Optional one-level subcategory (slug from lib/categories). Null on legacy
  // rows created before the taxonomy landed.
  subcategory?: string | null;
  gender: Gender;
  brand: string | null;
  size: string | null;
  // Optional colour slug from lib/itemColors. Null on legacy rows.
  color?: string | null;
  condition: Condition;
  // `listings.images` is `text[]` with no NOT NULL constraint, so Postgres can
  // and does hand back null. Typing this as `string[]` hid that from the
  // compiler and let `listing.images.map()` white-screen the product page on
  // any such row. Keep it nullable so every read has to answer for it.
  images: string[] | null;
  // Card-sized copies of `images`, index-aligned, written at upload time (see
  // lib/upload.ts). Null on rows created before the column existed, and absent
  // from any query that doesn't select it — read it through
  // `cardImageUrl()` in lib/images.ts rather than indexing it directly, so the
  // fallback to the full-size image stays in one place.
  thumbnails?: string[] | null;
  is_sold: boolean;
  views: number;
  likes: number;
  // Seller-defined free-form tags. Stored as text[] in Postgres with a GIN
  // index so discover can do `tags && '{x,y}'` lookups cheaply.
  tags?: string[];
  // Optional free-text material (e.g. "Faux fur", "Cotton"). Null on legacy rows.
  material?: string | null;
  // Optional shipping parcel size, one of 'small' | 'medium' | 'large'. Null on legacy rows.
  parcel_size?: string | null;
  user_has_liked?: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  listing_id: string;
  listing: Listing;
  buyer_id: string;
  seller_id: string;
  other_user: User;
  last_message: string | null;
  updated_at: string;
}
