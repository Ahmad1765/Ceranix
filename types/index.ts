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
  full_name: string;
  bio: string | null;
  location: string | null;
  rating: number;
  total_sales: number;
  created_at: string;
}

export interface Listing {
  id: string;
  seller_id: string;
  seller: User;
  title: string;
  description: string;
  price: number; // in PKR
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
