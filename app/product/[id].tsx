import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Listing } from '@/types';

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = width * 1.15;

const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Very good condition',
  fair: 'Fair',
};

const CATEGORY_LABELS: Record<string, string> = {
  clothing: 'Clothing',
  shoes: 'Shoes',
  bags: 'Bags',
  accessories: 'Accessories',
  electronics: 'Electronics',
  beauty: 'Beauty',
  other: 'Other',
};

const ITEM_COLOR = { name: 'Marine blue', hex: '#1d4ed8' };

const ITEM_TAGS = [
  'arcteryx',
  'jacket',
  'gorpcore',
  'midlayer',
  'hiking',
  'skiing',
  'lightweight',
  'breathable',
];

const TAG_BG = '#dcfb6b';
const LINK_PURPLE = '#5b21b6';

const REVIEWS_COUNT = 7;
const TRANSACTIONS_COUNT = 12;
const ITEMS_FOR_SALE = 9;
const LISTING_ID = '91740406';

const MOCK_LISTING: Listing = {
  id: '1',
  seller_id: 'u1',
  seller: {
    id: 'u1',
    username: 'mattsunil4048',
    avatar_url: 'https://picsum.photos/seed/avatar1/100/100',
    full_name: 'Matt Sunil',
    bio: null,
    location: 'Canada',
    rating: 5,
    total_sales: 12,
    created_at: '',
  },
  title: 'Arcteryx Atom SL Hoody',
  description: 'Great mid-layer jacket!\nSuper warm while hiking or skiing',
  price: 202,
  category: 'clothing',
  gender: 'men',
  brand: "Arc'teryx",
  size: 'M',
  condition: 'good',
  images: [
    'https://picsum.photos/seed/poc1/400/520',
    'https://picsum.photos/seed/poc2/400/520',
    'https://picsum.photos/seed/poc3/400/520',
  ],
  is_sold: false,
  views: 120,
  likes: 83,
  created_at: '',
};

type RelatedItem = {
  id: string;
  images: string[];
  brand: string;
  meta: string;
  price: number;
  inclPrice: number;
  likes: number;
};

const MEMBER_ITEMS: RelatedItem[] = [
  {
    id: 'm1',
    images: [
      'https://picsum.photos/seed/mi1/400/520',
      'https://picsum.photos/seed/mi1b/400/520',
      'https://picsum.photos/seed/mi1c/400/520',
    ],
    brand: 'Ralph Lauren',
    meta: 'S · Very good',
    price: 49,
    inclPrice: 52.15,
    likes: 7,
  },
  {
    id: 'm2',
    images: [
      'https://picsum.photos/seed/mi2/400/520',
      'https://picsum.photos/seed/mi2b/400/520',
      'https://picsum.photos/seed/mi2c/400/520',
    ],
    brand: 'Carolina Herrera',
    meta: 'S / 36 / 8 · New with tags',
    price: 190,
    inclPrice: 200.2,
    likes: 8,
  },
  {
    id: 'm3',
    images: [
      'https://picsum.photos/seed/mi3/400/520',
      'https://picsum.photos/seed/mi3b/400/520',
      'https://picsum.photos/seed/mi3c/400/520',
    ],
    brand: 'Hugo Boss',
    meta: 'M · Good',
    price: 35,
    inclPrice: 37.65,
    likes: 4,
  },
  {
    id: 'm4',
    images: [
      'https://picsum.photos/seed/mi4/400/520',
      'https://picsum.photos/seed/mi4b/400/520',
      'https://picsum.photos/seed/mi4c/400/520',
    ],
    brand: 'Burberry',
    meta: 'L · Very good',
    price: 89,
    inclPrice: 94.2,
    likes: 12,
  },
];

const SIMILAR_ITEMS: RelatedItem[] = [
  {
    id: 's1',
    images: [
      'https://picsum.photos/seed/si1/400/520',
      'https://picsum.photos/seed/si1b/400/520',
      'https://picsum.photos/seed/si1c/400/520',
    ],
    brand: "Arc'teryx",
    meta: 'M · Very good',
    price: 175,
    inclPrice: 184.65,
    likes: 23,
  },
  {
    id: 's2',
    images: [
      'https://picsum.photos/seed/si2/400/520',
      'https://picsum.photos/seed/si2b/400/520',
      'https://picsum.photos/seed/si2c/400/520',
    ],
    brand: 'Patagonia',
    meta: 'L · Like new',
    price: 120,
    inclPrice: 126.6,
    likes: 15,
  },
  {
    id: 's3',
    images: [
      'https://picsum.photos/seed/si3/400/520',
      'https://picsum.photos/seed/si3b/400/520',
      'https://picsum.photos/seed/si3c/400/520',
    ],
    brand: 'The North Face',
    meta: 'M · Good',
    price: 95,
    inclPrice: 100.45,
    likes: 9,
  },
  {
    id: 's4',
    images: [
      'https://picsum.photos/seed/si4/400/520',
      'https://picsum.photos/seed/si4b/400/520',
      'https://picsum.photos/seed/si4c/400/520',
    ],
    brand: 'Stone Island',
    meta: 'L · Very good',
    price: 245,
    inclPrice: 258.95,
    likes: 31,
  },
];

const TEAL = '#007782';
const BUNDLE_BLUE = '#5b5bd6';

const BUNDLE_MILESTONES = [
  { items: '1 item', discount: '0% off', active: false },
  { items: '2 items', discount: '5% off', active: true },
  { items: '3 items', discount: '10% off', active: true },
  { items: '4 items', discount: '15% off', active: true },
  { items: '5+ items', discount: '20% off', active: true },
];

const CARD_GAP = 8;
const CARD_OUTER_PAD = 12;
const CARD_WIDTH = (width - CARD_OUTER_PAD * 2 - CARD_GAP) / 2;
const CARD_IMAGE_HEIGHT = CARD_WIDTH * 1.25;

function RelatedItemCard({ item, onPress }: { item: RelatedItem; onPress: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultiple = item.images.length > 1;
  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH, marginBottom: 18 }}>
      <View
        style={{
          position: 'relative',
          width: CARD_WIDTH,
          height: CARD_IMAGE_HEIGHT,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: '#f3f4f6',
        }}
      >
        {hasMultiple ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={(e) =>
              setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH))
            }
            scrollEventThrottle={16}
            disableIntervalMomentum
          >
            {item.images.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <Image
            source={{ uri: item.images[0] }}
            style={{ width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT }}
            contentFit="cover"
          />
        )}

        {hasMultiple && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 6,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {item.images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === activeIndex ? 'white' : 'rgba(255,255,255,0.55)',
                }}
              />
            ))}
          </View>
        )}

        <View
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: 'white',
            borderRadius: 16,
            paddingHorizontal: 9,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        >
          <Feather name="heart" size={13} color="#374151" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{item.likes}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, color: '#374151', marginTop: 8 }} numberOfLines={1}>
        {item.brand}
      </Text>
      <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }} numberOfLines={1}>
        {item.meta}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4 }}>
        €{item.price.toFixed(2)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <Text style={{ fontSize: 13, color: TEAL }}>€{item.inclPrice.toFixed(2)} incl.</Text>
        <Ionicons name="shield-checkmark" size={13} color={TEAL} />
      </View>
    </Pressable>
  );
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : 'star-outline'}
          size={14}
          color={i < full ? '#f59e0b' : '#d1d5db'}
        />
      ))}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [activeImage, setActiveImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');
  const listing = MOCK_LISTING;

  const originalPrice = Math.round(listing.price * 1.24);
  const discountPct = Math.round((1 - listing.price / originalPrice) * 100);
  const offerPrice = Math.floor(listing.price * 0.9);
  const heartCount = liked ? listing.likes + 1 : listing.likes;

  const metaLine = [
    listing.gender === 'men' ? `Men's US ${listing.size} / EU 48-50 / 2` : listing.size,
    CONDITION_LABELS[listing.condition] ?? listing.condition,
    listing.seller.location ? `Located in ${listing.seller.location}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Sticky header */}
      {showStickyHeader && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
          paddingTop: insets.top,
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingBottom: 12,
        }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#111827" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {listing.title}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>
            ${listing.price}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={(e) => {
          setShowStickyHeader(e.nativeEvent.contentOffset.y > IMAGE_HEIGHT - 80);
        }}
        scrollEventThrottle={16}
      >
        {/* ── Image carousel ── */}
        <View style={{ position: 'relative' }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            onScroll={(e) => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / width))}
            scrollEventThrottle={16}
          >
            {listing.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={{ width, height: IMAGE_HEIGHT }} contentFit="cover" />
            ))}
          </ScrollView>

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              left: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="arrow-left" size={20} color="white" />
          </Pressable>

          {/* VERIFIED badge */}
          <View style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 64,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.82)',
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 5,
            gap: 4,
          }}>
            <Ionicons name="checkmark-circle" size={14} color="white" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: 'white', letterSpacing: 0.5 }}>
              VERIFIED
            </Text>
          </View>

          {/* Pagination dots */}
          {listing.images.length > 1 && (
            <View style={{
              position: 'absolute', bottom: 14, left: 0, right: 0,
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
            }}>
              {listing.images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 7, height: 7, borderRadius: 4,
                    backgroundColor: i === activeImage ? '#111827' : '#d1d5db',
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Seller card ── */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            {/* Avatar */}
            <View style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
              {listing.seller.avatar_url ? (
                <Image source={{ uri: listing.seller.avatar_url }} style={{ width: 52, height: 52 }} contentFit="cover" />
              ) : (
                <Feather name="user" size={24} color="#9ca3af" />
              )}
            </View>

            {/* Seller info */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                {listing.seller.username}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <StarRating rating={listing.seller.rating} />
                <Text style={{ fontSize: 13, color: '#374151' }}>{REVIEWS_COUNT} Reviews</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                {TRANSACTIONS_COUNT} Transactions{'  '}
                <Text style={{ textDecorationLine: 'underline' }}>{ITEMS_FOR_SALE} items for sale</Text>
              </Text>
            </View>
          </View>

          {/* Follow + Message buttons */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setFollowed(!followed)}
              style={{
                flex: 1, borderRadius: 6, paddingVertical: 12, alignItems: 'center',
                backgroundColor: followed ? '#f3f4f6' : '#111827',
                borderWidth: followed ? 1 : 0, borderColor: '#d1d5db',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: followed ? '#111827' : 'white', letterSpacing: 0.5 }}>
                {followed ? 'FOLLOWING' : 'FOLLOW'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Message', 'Opening chat...')}
              style={{ flex: 1, borderRadius: 6, paddingVertical: 12, alignItems: 'center', backgroundColor: '#1d4ed8' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: 'white', letterSpacing: 0.5 }}>
                SEND A MESSAGE
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Item description ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>
            Item description
          </Text>

          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
            {/* Description text */}
            <Text style={{ fontSize: 16, color: '#111827', lineHeight: 24 }}>
              {listing.description}
            </Text>

            {/* Show translation */}
            <Pressable onPress={() => Alert.alert('Translation')} style={{ marginTop: 14, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: LINK_PURPLE }}>
                Show translation
              </Text>
            </Pressable>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 18 }} />

            {/* Category */}
            <Pressable onPress={() => {}} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Category </Text>
                {CATEGORY_LABELS[listing.category] ?? listing.category}
              </Text>
              <Feather name="arrow-up-right" size={20} color="#111827" />
            </Pressable>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Size */}
            <Text style={{ fontSize: 16, color: '#111827' }}>
              <Text style={{ fontWeight: '700' }}>Size </Text>
              {listing.size}
            </Text>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Condition */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Condition </Text>
                {CONDITION_LABELS[listing.condition] ?? listing.condition}
              </Text>
              <Pressable onPress={() => Alert.alert('Condition info', 'Details about condition grading')} hitSlop={8}>
                <Feather name="info" size={20} color="#111827" />
              </Pressable>
            </View>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Color */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827' }}>
                <Text style={{ fontWeight: '700' }}>Color </Text>
                {ITEM_COLOR.name}
              </Text>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  marginLeft: 8,
                  backgroundColor: ITEM_COLOR.hex,
                  borderWidth: 2,
                  borderColor: '#e5e7eb',
                }}
              />
            </View>

            <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 }} />

            {/* Brand */}
            <Pressable onPress={() => {}} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#111827', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Brand </Text>
                {listing.brand}
              </Text>
              <Feather name="arrow-up-right" size={20} color="#111827" />
            </Pressable>
          </View>

          {/* Tags */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8 }}>
            {ITEM_TAGS.map((tag) => (
              <View
                key={tag}
                style={{
                  backgroundColor: TAG_BG,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontSize: 14, color: '#374151' }}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Contact / Share / Report */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 24,
              paddingHorizontal: 8,
            }}
          >
            <Pressable
              onPress={() => Alert.alert('Contact')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="message-circle" size={22} color="#111827" />
              <Text style={{ fontSize: 16, color: '#111827' }}>Contact</Text>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Share')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="share-2" size={22} color="#111827" />
              <Text style={{ fontSize: 16, color: '#111827' }}>Share</Text>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Report')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="alert-triangle" size={22} color="#111827" />
              <Text style={{ fontSize: 16, color: '#111827' }}>Report</Text>
            </Pressable>
          </View>

          {/* Listing meta */}
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, paddingHorizontal: 8 }}>
            Listing ID {LISTING_ID}
          </Text>
        </View>

        {/* ── Carrinex Verified card ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name="checkmark-circle" size={28} color="#2563eb" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Carrinex Verified</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19 }}>
            This item has been verified by our in-house team or a trusted partner.{' '}
            <Text style={{ color: '#2563eb' }} onPress={() => {}}>Learn More.</Text>
          </Text>
        </View>

        {/* ── Purchase Protection card ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name="shield" size={26} color="#2563eb" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Carrinex Purchase Protection</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19, marginBottom: 14 }}>
            We want you to feel safe buying and selling on Carrinex. Qualifying orders are covered by our Purchase Protection in the rare case something goes wrong.
          </Text>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} onPress={() => {}}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>How You're Protected</Text>
            <Feather name="chevron-down" size={18} color="#6b7280" />
          </Pressable>
        </View>

        {/* ── Member's items / Similar items tabs ── */}
        <View style={{ borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <Pressable
              onPress={() => setRelatedTab('members')}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: relatedTab === 'members' ? TEAL : 'transparent',
                marginBottom: -1,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: relatedTab === 'members' ? '700' : '400',
                  color: relatedTab === 'members' ? '#111827' : '#6b7280',
                }}
              >
                Member's items
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRelatedTab('similar')}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: relatedTab === 'similar' ? TEAL : 'transparent',
                marginBottom: -1,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: relatedTab === 'similar' ? '700' : '400',
                  color: relatedTab === 'similar' ? '#111827' : '#6b7280',
                }}
              >
                Similar items
              </Text>
            </Pressable>
          </View>

          {relatedTab === 'members' ? (
            <View style={{ paddingTop: 18 }}>
              {/* Bundle discounts title */}
              <Text style={{ fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: -0.24, color: '#111827', paddingHorizontal: 16, marginBottom: 14 }}>
                Bundle discounts from {listing.seller.username}
              </Text>

              {/* Bundle discount banner */}
              <View style={{ marginHorizontal: 16, marginBottom: 20, backgroundColor: '#ededfa', borderRadius: 16, padding: 18 }}>
                <Text style={{ fontSize: 16, color: '#111827', lineHeight: 24, marginBottom: 22 }}>
                  Add items from this seller to your cart to unlock discounts—plus potential savings on shipping!
                </Text>

                {/* Progress track */}
                <View style={{ height: 16, marginBottom: 14, position: 'relative' }}>
                  {/* Gray track */}
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#d0d0ea', borderRadius: 99 }} />
                  {/* Blue fill */}
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '25%' }}>
                    <View style={{ flex: 1, backgroundColor: BUNDLE_BLUE, borderTopLeftRadius: 99, borderBottomLeftRadius: 99 }} />
                    {/* Arrow tip */}
                    <View style={{
                      position: 'absolute', right: -11, top: 0,
                      width: 0, height: 0,
                      borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 12,
                      borderTopColor: 'transparent', borderBottomColor: 'transparent',
                      borderLeftColor: BUNDLE_BLUE,
                    }} />
                  </View>
                </View>

                {/* Milestones */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {BUNDLE_MILESTONES.map((m, i) => (
                    <View key={i} style={{ alignItems: 'center' }}>
                      <View style={{ width: 1.5, height: 10, backgroundColor: '#9ca3af', marginBottom: 6 }} />
                      <Text style={{ fontSize: 13, color: '#111827', textAlign: 'center' }}>{m.items}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: m.active ? BUNDLE_BLUE : '#6b7280', textAlign: 'center' }}>{m.discount}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: CARD_OUTER_PAD,
                  columnGap: CARD_GAP,
                }}
              >
                {MEMBER_ITEMS.map((item) => (
                  <RelatedItemCard key={item.id} item={item} onPress={() => router.push(`/product/${item.id}`)} />
                ))}
              </View>
            </View>
          ) : (
            <View style={{ paddingTop: 18 }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: CARD_OUTER_PAD,
                  columnGap: CARD_GAP,
                }}
              >
                {SIMILAR_ITEMS.map((item) => (
                  <RelatedItemCard key={item.id} item={item} onPress={() => router.push(`/product/${item.id}`)} />
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed bottom bar ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'white',
        borderTopWidth: 1, borderTopColor: '#e5e7eb',
        paddingHorizontal: 16, paddingTop: 12,
        paddingBottom: insets.bottom || 16,
        flexDirection: 'row', gap: 10,
      }}>
        <Pressable
          onPress={() => Alert.alert('Offer', `Send offer of $${offerPrice}?`)}
          style={{
            flex: 1, borderWidth: 1.5, borderColor: '#111827',
            borderRadius: 6, paddingVertical: 15, alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>OFFER ${offerPrice}</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('Buy Now', 'Payment flow coming soon')}
          style={{ flex: 1, backgroundColor: '#111827', borderRadius: 6, paddingVertical: 15, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>BUY NOW</Text>
        </Pressable>
      </View>
    </View>
  );
}
