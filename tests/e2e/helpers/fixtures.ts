// Deterministic factories for the rows the app reads from Supabase.
// Every spec calls `seedDefault()` then layers spec-specific overrides on top,
// so tests stay independent and reproducible across runs.

import type { Category, Condition, Gender } from '../../../types';

export const USERS = {
  alice: {
    id: '00000000-0000-0000-0000-00000000a11c',
    email: 'alice@example.test',
    username: 'alice',
    full_name: 'Alice Test',
    avatar_url: null,
    bio: 'Sustainable closet, well-loved finds.',
    location: 'Karachi',
    rating: 4.7,
    total_sales: 12,
    created_at: '2025-01-15T10:00:00.000Z',
    vacation_mode: false,
    bundle_discount_pct: 0,
    is_verified: true,
    is_pro: false,
    followers_count: 128,
    following_count: 42,
  },
  bob: {
    id: '00000000-0000-0000-0000-0000000000b0',
    email: 'bob@example.test',
    username: 'bob.shop',
    full_name: 'Bob Seller',
    avatar_url: null,
    bio: null,
    location: 'Lahore',
    rating: 4.2,
    total_sales: 5,
    created_at: '2025-02-20T10:00:00.000Z',
    vacation_mode: false,
    bundle_discount_pct: 10,
    is_verified: false,
    is_pro: false,
    followers_count: 31,
    following_count: 8,
  },
} as const;

export type FixtureListing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  category: Category;
  gender: Gender;
  brand: string | null;
  size: string | null;
  condition: Condition;
  images: string[];
  is_sold: boolean;
  views: number;
  likes: number;
  created_at: string;
  seller?: (typeof USERS)[keyof typeof USERS];
};

export const LISTINGS: FixtureListing[] = [
  {
    id: 'a1111111-1111-1111-1111-111111111111',
    seller_id: USERS.bob.id,
    title: 'Vintage denim jacket',
    description: 'Faded blue, light wear, perfect oversize fit.',
    price: 65,
    category: 'clothing',
    gender: 'unisex',
    brand: 'Levis',
    size: 'M',
    condition: 'like_new',
    images: ['https://picsum.photos/seed/listing-1/600/800'],
    is_sold: false,
    views: 124,
    likes: 18,
    created_at: '2026-05-10T08:00:00.000Z',
  },
  {
    id: 'a2222222-2222-2222-2222-222222222222',
    seller_id: USERS.bob.id,
    title: 'White leather sneakers',
    description: 'Worn twice. Original box included.',
    price: 80,
    category: 'shoes',
    gender: 'women',
    brand: 'Common Projects',
    size: '38',
    condition: 'new_with_tags',
    images: ['https://picsum.photos/seed/listing-2/600/800'],
    is_sold: false,
    views: 240,
    likes: 31,
    created_at: '2026-05-12T09:00:00.000Z',
  },
  {
    id: 'a3333333-3333-3333-3333-333333333333',
    seller_id: USERS.alice.id,
    title: 'Beaded clutch bag',
    description: 'Hand-beaded evening clutch.',
    price: 45,
    category: 'bags',
    gender: 'women',
    brand: 'Zara',
    size: null,
    condition: 'good',
    images: ['https://picsum.photos/seed/listing-3/600/800'],
    is_sold: false,
    views: 64,
    likes: 7,
    created_at: '2026-05-14T11:30:00.000Z',
  },
  {
    id: 'a4444444-4444-4444-4444-444444444444',
    seller_id: USERS.alice.id,
    title: 'Gold hoop earrings',
    description: 'Tarnish-free, sterling silver core.',
    price: 24,
    category: 'accessories',
    gender: 'women',
    brand: null,
    size: null,
    condition: 'like_new',
    images: ['https://picsum.photos/seed/listing-4/600/800'],
    is_sold: false,
    views: 12,
    likes: 3,
    created_at: '2026-05-15T13:00:00.000Z',
  },
  {
    id: 'a5555555-5555-5555-5555-555555555555',
    seller_id: USERS.bob.id,
    title: 'Last-gen iPhone',
    description: 'Battery 92%, no scratches.',
    price: 520,
    category: 'electronics',
    gender: 'unisex',
    brand: 'Apple',
    size: null,
    condition: 'good',
    images: ['https://picsum.photos/seed/listing-5/600/800'],
    is_sold: true,
    views: 380,
    likes: 44,
    created_at: '2026-04-22T18:00:00.000Z',
  },
];

export function hydrateListing(l: FixtureListing): FixtureListing {
  const seller = Object.values(USERS).find((u) => u.id === l.seller_id);
  return { ...l, seller };
}

export const CONVERSATIONS = [
  {
    id: 'c1111111-1111-1111-1111-111111111111',
    listing_id: LISTINGS[0].id,
    buyer_id: USERS.alice.id,
    seller_id: USERS.bob.id,
    last_message: 'Is this still available?',
    last_sender_id: USERS.alice.id,
    updated_at: '2026-05-16T10:00:00.000Z',
  },
];

export const MESSAGES = [
  {
    id: 'm1111111-1111-1111-1111-111111111111',
    conversation_id: CONVERSATIONS[0].id,
    sender_id: USERS.alice.id,
    content: 'Is this still available?',
    kind: 'text',
    metadata: null,
    offer_status: null,
    created_at: '2026-05-16T10:00:00.000Z',
  },
  {
    id: 'm2222222-2222-2222-2222-222222222222',
    conversation_id: CONVERSATIONS[0].id,
    sender_id: USERS.bob.id,
    content: 'Yes — happy to send more photos!',
    kind: 'text',
    metadata: null,
    offer_status: null,
    created_at: '2026-05-16T10:05:00.000Z',
  },
];

export const SESSION_TEMPLATE = (user: (typeof USERS)[keyof typeof USERS]) => ({
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: '2025-01-15T10:00:00.000Z',
    phone: '',
    confirmed_at: '2025-01-15T10:00:00.000Z',
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2025-01-15T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
});
