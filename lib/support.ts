import { supabase } from '@/lib/supabase';
import {
  getOrCreateConversation,
  sendMessage,
  CONVERSATION_SELECT,
  isTransactionalConversation,
  type ConversationRow,
  type ChatMessage,
} from '@/lib/chat';

export const SUPPORT_BOT_USER_ID = '00000000-0000-0000-0000-000000000001';
export const SUPPORT_BOT_NAME = 'Grabsty Support';
export const SUPPORT_BOT_USERNAME = 'grabsty_support';
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
    prompt: 'How does Buyer Protection and refunds work on Grabsty?',
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
      `🛡️ **Grabsty Buyer Protection**\n\n` +
      `Every transaction processed through Grabsty is 100% protected:\n\n` +
      `• **Safe Escrow**: We hold your payment securely until you receive and inspect your parcel.\n` +
      `• **48-Hour Inspection Window**: You have 2 days from delivery to verify your item. If it’s damaged or not as described, tap "I have an issue" to pause payout.\n` +
      `• **Full Refund Guarantee**: If an item never arrives or is counterfeit, you get a full refund including shipping fees.`,
  },
  {
    keywords: ['payout', 'withdraw', 'bank', 'easypaisa', 'jazzcash', 'wallet', 'funds', 'seller money'],
    title: 'Seller Payouts & Wallet',
    answer:
      `💳 **Seller Payouts**\n\n` +
      `• Once the buyer confirms delivery (or 48h after courier delivery), funds are released to your **Grabsty Balance**.\n` +
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
      `• Grabsty maintains a zero-tolerance policy against scams, replicas, and harassment.\n` +
      `• Tap the **•••** menu at the top right of any chat or listing to report.\n` +
      `• Our moderation team reviews all reports within 2 hours. Never transfer money outside the Grabsty checkout system.`,
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

/**
 * A direct conversation is a user-to-user thread not tied to any listing (non-transactional)
 * and not involving the Support Bot.
 */
export function isDirectConversation(conv: ConversationRow | null | undefined): boolean {
  if (!conv) return false;
  return !isTransactionalConversation(conv) && !isSupportConversation(conv);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, kw: string): boolean {
  const regex = new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, 'i');
  return regex.test(text);
}

export function generateSupportResponse(query: string): string {
  const clean = query.toLowerCase().trim();

  let bestMatch: (typeof KNOWLEDGE_BASE)[number] | null = null;
  let highestScore = 0;

  // Find highest scoring topic by number of matched whole-term keywords
  for (const item of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of item.keywords) {
      if (matchesKeyword(clean, kw)) {
        score += 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && highestScore > 0) {
    return bestMatch.answer;
  }

  // Default intelligent assistant response
  return (
    `👋 **Hi there! I'm the Grabsty Support Assistant.**\n\n` +
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
        bio: 'Official Grabsty Customer Support & Help Assistant. Available 24/7.',
        location: 'Grabsty Care, PK',
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
  const { data: existingRows, error: lookupError } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .is('listing_id', null)
    .or(`and(buyer_id.eq.${userId},seller_id.eq.${SUPPORT_BOT_USER_ID}),and(buyer_id.eq.${SUPPORT_BOT_USER_ID},seller_id.eq.${userId})`)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (lookupError) {
    console.warn('[support] getOrCreateSupportConversation lookup', lookupError.message);
  }

  const existing = existingRows?.[0];
  if (existing) return existing as unknown as ConversationRow;

  // Otherwise create a new direct conversation
  const created = await getOrCreateConversation({
    buyerId: userId,
    sellerId: SUPPORT_BOT_USER_ID,
    listingId: null,
  });

  if (created) {
    // Send welcome message via secure RPC or fallback
    const welcomeMsg =
      `👋 Welcome to Grabsty Support!\n\n` +
      `How can we assist you today? Feel free to ask about your orders, Buyer Protection, payments, or selling on Grabsty.`;

    try {
      const { data, error } = await supabase.rpc('dispatch_support_bot_reply', {
        p_conversation_id: created.id,
        p_content: welcomeMsg,
      });
      if (error || !data) {
        await sendMessage({
          conversationId: created.id,
          senderId: SUPPORT_BOT_USER_ID,
          content: welcomeMsg,
        });
      }
    } catch {
      await sendMessage({
        conversationId: created.id,
        senderId: SUPPORT_BOT_USER_ID,
        content: welcomeMsg,
      });
    }
  }

  return created;
}

export async function sendSupportBotReply(conversationId: string, userMessage: string): Promise<ChatMessage | null> {
  const replyText = generateSupportResponse(userMessage);

  // 1. Trusted server-side RPC path enforcing sender identity & authorization
  try {
    const { data, error } = await supabase.rpc('dispatch_support_bot_reply', {
      p_conversation_id: conversationId,
      p_content: replyText,
    });
    if (!error && data) {
      return data as unknown as ChatMessage;
    }
    if (error) {
      console.warn('[support] server rpc dispatch_support_bot_reply error, falling back', error.message);
    }
  } catch (rpcErr) {
    console.warn('[support] server rpc dispatch_support_bot_reply failed, falling back', rpcErr);
  }

  // 2. Direct fallback (for tests and offline/demo environments)
  try {
    return await sendMessage({
      conversationId,
      senderId: SUPPORT_BOT_USER_ID,
      content: replyText,
    });
  } catch (err) {
    console.warn('[support] bot reply fallback error', err);
    return null;
  }
}

// ── Admin Support Team Interfaces & Helpers ─────────────────────────────────

export interface AdminSupportConversation {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  last_message?: string | null;
  updated_at: string;
  message_count: number;
  is_dispute: boolean;
}

/**
 * Automatically starts a support chat for an order dispute and sends an
 * alert message informing the buyer that the admin team has been notified.
 */
export async function startDisputeSupportChat({
  orderId,
  reason,
  buyerId,
}: {
  orderId: string;
  reason: string;
  buyerId: string;
}): Promise<ConversationRow | null> {
  try {
    const conv = await getOrCreateSupportConversation(buyerId);
    if (!conv) return null;

    const shortId = orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const disputeNotice =
      `🚨 **Support Ticket Opened: Order Dispute**\n\n` +
      `Order **#${shortId}** has been placed under dispute.\n` +
      `**Reason:** ${reason.trim()}\n\n` +
      `Our administration team has been notified and escrow funds are placed securely on hold. An administrator will review your case and personally respond to you here shortly.\n\n` +
      `You can reply directly in this chat to provide photo evidence, courier receipts, or additional notes.`;

    await sendMessage({
      conversationId: conv.id,
      senderId: SUPPORT_BOT_USER_ID,
      content: disputeNotice,
    });

    return conv;
  } catch (err) {
    console.warn('[support] startDisputeSupportChat failed', err);
    return null;
  }
}

/**
 * Fetch all support conversations for the administrative workbench.
 */
export async function fetchAdminSupportConversations(
  filter: 'all' | 'disputes' | 'general' = 'all',
): Promise<AdminSupportConversation[]> {
  try {
    const { data, error } = await supabase.rpc('admin_get_support_conversations', {
      p_filter: filter,
    });
    if (!error && data) {
      return data as AdminSupportConversation[];
    }
  } catch (e) {
    console.warn('[support] admin_get_support_conversations rpc failed, falling back', e);
  }

  // Fallback: direct query on conversations
  try {
    const { data: convs, error } = await supabase
      .from('conversations')
      .select(`
        id,
        buyer_id,
        seller_id,
        last_message,
        updated_at,
        buyer:profiles!conversations_buyer_id_fkey(id, username, full_name, avatar_url),
        seller:profiles!conversations_seller_id_fkey(id, username, full_name, avatar_url)
      `)
      .or(`buyer_id.eq.${SUPPORT_BOT_USER_ID},seller_id.eq.${SUPPORT_BOT_USER_ID}`)
      .order('updated_at', { ascending: false });

    if (error || !convs) return [];

    return convs.map((c: any) => {
      const isBotBuyer = c.buyer_id === SUPPORT_BOT_USER_ID;
      const user = isBotBuyer ? c.seller : c.buyer;
      const isDispute = (c.last_message || '').toLowerCase().includes('dispute');
      return {
        id: c.id,
        user_id: user?.id || (isBotBuyer ? c.seller_id : c.buyer_id),
        username: user?.username || 'member',
        full_name: user?.full_name || 'Grabsty Member',
        avatar_url: user?.avatar_url,
        last_message: c.last_message,
        updated_at: c.updated_at,
        message_count: 1,
        is_dispute: isDispute,
      };
    }).filter((item) => {
      if (filter === 'disputes') return item.is_dispute;
      if (filter === 'general') return !item.is_dispute;
      return true;
    });
  } catch (err) {
    console.warn('[support] fetchAdminSupportConversations fallback failed', err);
    return [];
  }
}

/**
 * Fetch messages for a support conversation for admin viewing.
 */
export async function fetchAdminSupportMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase.rpc('admin_get_support_messages', {
      p_conversation_id: conversationId,
    });
    if (!error && data) {
      return data as ChatMessage[];
    }
  } catch (e) {
    console.warn('[support] admin_get_support_messages rpc failed, falling back', e);
  }

  // Fallback direct messages query
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as ChatMessage[];
  } catch (err) {
    console.warn('[support] fetchAdminSupportMessages fallback failed', err);
    return [];
  }
}

/**
 * Admin personally responds to a user query in a support conversation.
 */
export async function adminSendSupportMessage({
  conversationId,
  content,
}: {
  conversationId: string;
  content: string;
}): Promise<ChatMessage | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  // 1. Dedicated Admin Support RPC
  try {
    const { data, error } = await supabase.rpc('admin_send_support_message', {
      p_conversation_id: conversationId,
      p_content: trimmed,
    });
    if (!error && data) {
      return data as ChatMessage;
    }
  } catch (e) {
    console.warn('[support] admin_send_support_message rpc failed, falling back', e);
  }

  // 2. Dispatch support bot reply RPC
  try {
    const { data, error } = await supabase.rpc('dispatch_support_bot_reply', {
      p_conversation_id: conversationId,
      p_content: trimmed,
    });
    if (!error && data) {
      return data as ChatMessage;
    }
  } catch (e) {
    console.warn('[support] dispatch_support_bot_reply rpc failed, falling back', e);
  }

  // 3. Current authenticated user insert with official admin support metadata
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const msg = await sendMessage({
        conversationId,
        senderId: user.id,
        content: trimmed,
        metadata: { is_admin_support: true, sender_name: 'Grabsty Support' },
      });
      if (msg) return msg;
    }
  } catch (err) {
    console.warn('[support] admin authenticated insert fallback failed', err);
  }

  // 4. Direct bot insert fallback
  try {
    return await sendMessage({
      conversationId,
      senderId: SUPPORT_BOT_USER_ID,
      content: trimmed,
    });
  } catch (err) {
    console.warn('[support] adminSendSupportMessage fallback failed', err);
    return null;
  }
}

