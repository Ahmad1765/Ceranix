import { supabase } from '@/lib/supabase';
import { getOrCreateConversation, sendMessage, type ConversationRow } from '@/lib/chat';

export const SUPPORT_BOT_USER_ID = '00000000-0000-0000-0000-000000000001';
export const SUPPORT_BOT_NAME = 'Ceranix Support';
export const SUPPORT_BOT_USERNAME = 'ceranix_support';
export const SUPPORT_BOT_AVATAR = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80';

export interface SupportTopic {
  id: string;
  icon: string;
  title: string;
  description: string;
  prompt: string;
}

export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: 'order_status',
    icon: 'package',
    title: 'Order Status & Tracking',
    description: 'Track deliveries, delays, or dispatch status',
    prompt: 'How do I track my order or check delivery status?',
  },
  {
    id: 'buyer_protection',
    icon: 'shield',
    title: 'Buyer Protection & Refunds',
    description: 'Learn how your purchases and money are safe',
    prompt: 'How does Buyer Protection and refunds work on Ceranix?',
  },
  {
    id: 'payouts_fees',
    icon: 'credit-card',
    title: 'Payments & Seller Payouts',
    description: 'Withdraw balance, payment methods & fees',
    prompt: 'How do seller payouts and wallet withdrawals work?',
  },
  {
    id: 'selling_guide',
    icon: 'tag',
    title: 'Selling & Shipping Guide',
    description: 'Tips to price, list and ship items fast',
    prompt: 'How do I ship sold items and get prepaid shipping labels?',
  },
  {
    id: 'report_issue',
    icon: 'alert-triangle',
    title: 'Report a Problem',
    description: 'Report suspicious activity, fraud or counterfeit',
    prompt: 'I want to report an issue or suspicious seller.',
  },
];

const KNOWLEDGE_BASE: { keywords: string[]; title: string; answer: string }[] = [
  {
    keywords: ['track', 'order', 'delivery', 'package', 'shipping', 'dispatch', 'courier', 'where is'],
    title: 'Order Tracking & Delivery',
    answer:
      `📦 **Tracking Your Order**\n\n` +
      `1. Head to your **Profile** > **My Orders**.\n` +
      `2. Tap on your active order to view live courier status, tracking number, and estimated delivery date.\n` +
      `3. Sellers have up to **5 business days** to dispatch. Once shipped, standard delivery takes 2–4 business days across Pakistan.\n\n` +
      `Need help with a delayed parcel? Feel free to reply with your order details.`,
  },
  {
    keywords: ['protection', 'refund', 'money back', 'guarantee', 'damaged', 'not as described', 'return', 'cancel'],
    title: 'Buyer Protection Guarantee',
    answer:
      `🛡️ **Ceranix Buyer Protection**\n\n` +
      `Every transaction processed through Ceranix is 100% protected:\n\n` +
      `• **Safe Escrow**: We hold your payment securely until you receive and inspect your parcel.\n` +
      `• **48-Hour Inspection Window**: You have 2 days from delivery to verify your item. If it’s damaged or not as described, tap "I have an issue" to pause payout.\n` +
      `• **Full Refund Guarantee**: If an item never arrives or is counterfeit, you get a full refund including shipping fees.`,
  },
  {
    keywords: ['payout', 'withdraw', 'bank', 'easypaisa', 'jazzcash', 'wallet', 'funds', 'seller money'],
    title: 'Seller Payouts & Wallet',
    answer:
      `💳 **Seller Payouts**\n\n` +
      `• Once the buyer confirms delivery (or 48h after courier delivery), funds are released to your **Ceranix Balance**.\n` +
      `• You can instantly withdraw to any Pakistani Bank Account, JazzCash, or Easypaisa.\n` +
      `• Withdrawals are processed within 24 business hours with zero hidden deduction fees.`,
  },
  {
    keywords: ['bundle', 'discount', 'multiple', 'combine'],
    title: 'Bundles & Combined Shipping',
    answer:
      `🛍️ **Bundle Discounts & Combined Shipping**\n\n` +
      `• You can bundle up to 10 items from the same seller to save on shipping fees.\n` +
      `• Tap **Shop Bundle** on any listing to add more pieces from that seller's closet.\n` +
      `• You can send a single bundle offer with your desired total price!`,
  },
  {
    keywords: ['report', 'scam', 'fake', 'counterfeit', 'fraud', 'abuse', 'harass', 'block'],
    title: 'Safety & Reporting',
    answer:
      `🚫 **Safety & Reporting Policy**\n\n` +
      `• Ceranix maintains a zero-tolerance policy against scams, replicas, and harassment.\n` +
      `• Tap the **•••** menu at the top right of any chat or listing to report.\n` +
      `• Our moderation team reviews all reports within 2 hours. Never transfer money outside the Ceranix checkout system.`,
  },
  {
    keywords: ['offer', 'negotiate', 'bargain', 'counter'],
    title: 'Offers & Negotiations',
    answer:
      `🤝 **Making & Countering Offers**\n\n` +
      `• Buyers can offer up to 25 times per day to keep closet discussions active.\n` +
      `• When a seller accepts your offer, you have 24 hours to complete checkout before the item is unlocked for other buyers.\n` +
      `• Sellers can accept, decline, or counter with their preferred price directly in chat.`,
  },
];

export function isSupportConversation(conv: ConversationRow | null | undefined): boolean {
  if (!conv) return false;
  return (
    conv.seller_id === SUPPORT_BOT_USER_ID ||
    conv.buyer_id === SUPPORT_BOT_USER_ID ||
    conv.seller?.username === SUPPORT_BOT_USERNAME ||
    conv.buyer?.username === SUPPORT_BOT_USERNAME
  );
}

export function generateSupportResponse(query: string): string {
  const clean = query.toLowerCase().trim();

  // Find best matching topic
  for (const item of KNOWLEDGE_BASE) {
    if (item.keywords.some((kw) => clean.includes(kw))) {
      return item.answer;
    }
  }

  // Default intelligent assistant response
  return (
    `👋 **Hi there! I'm the Ceranix Support Assistant.**\n\n` +
    `Thank you for reaching out. Here are the most common things I can assist you with right away:\n\n` +
    `• **"Track my order"** — Live status, courier info and delivery estimates\n` +
    `• **"Buyer Protection"** — Refunds, damaged items & safety policies\n` +
    `• **"Seller Payouts"** — Bank, JazzCash, Easypaisa withdrawal timelines\n` +
    `• **"Shipping Guide"** — Packaging, labels & drop-off points\n\n` +
    `Please type your question or specify what you need help with, and our team will ensure you're taken care of!`
  );
}

export async function ensureSupportProfile(): Promise<void> {
  // Upsert the system support profile if not already present
  try {
    await supabase.from('profiles').upsert(
      {
        id: SUPPORT_BOT_USER_ID,
        username: SUPPORT_BOT_USERNAME,
        full_name: SUPPORT_BOT_NAME,
        avatar_url: SUPPORT_BOT_AVATAR,
        bio: 'Official Ceranix Customer Support & Help Assistant. Available 24/7.',
        location: 'Ceranix Care, PK',
        rating: 5.0,
        total_sales: 9999,
      },
      { onConflict: 'id' },
    );
  } catch {
    // Ignore if already exists or permission
  }
}

export async function getOrCreateSupportConversation(userId: string): Promise<ConversationRow | null> {
  await ensureSupportProfile();

  // Find existing conversation with support bot
  const { data: existing } = await supabase
    .from('conversations')
    .select(`
      id, listing_id, buyer_id, seller_id, last_message, last_sender_id, updated_at,
      buyer_last_read_at, seller_last_read_at,
      listing:listings(id, title, price, images, thumbnails, is_sold),
      buyer:profiles!conversations_buyer_id_fkey(id, username, avatar_url, full_name, location, rating, total_sales),
      seller:profiles!conversations_seller_id_fkey(id, username, avatar_url, full_name, location, rating, total_sales)
    `)
    .is('listing_id', null)
    .or(`and(buyer_id.eq.${userId},seller_id.eq.${SUPPORT_BOT_USER_ID}),and(buyer_id.eq.${SUPPORT_BOT_USER_ID},seller_id.eq.${userId})`)
    .maybeSingle();

  if (existing) return existing as unknown as ConversationRow;

  // Otherwise create a new direct conversation
  const created = await getOrCreateConversation({
    buyerId: userId,
    sellerId: SUPPORT_BOT_USER_ID,
    listingId: null,
  });

  if (created) {
    // Send welcome message
    await sendMessage({
      conversationId: created.id,
      senderId: SUPPORT_BOT_USER_ID,
      content:
        `👋 Welcome to Ceranix Support!\n\n` +
        `How can we assist you today? Feel free to ask about your orders, Buyer Protection, payments, or selling on Ceranix.`,
    });
  }

  return created;
}
