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
const IMAGE_HEIGHT = width * 1.1;

const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Very good condition',
  fair: 'Fair',
};

const MOCK_LISTING: Listing = {
  id: '1',
  seller_id: 'u1',
  seller: {
    id: 'u1',
    username: 'axel_lundberg1',
    avatar_url: null,
    full_name: 'Axel Lundberg',
    bio: null,
    location: 'Stockholm',
    rating: 4.8,
    total_sales: 34,
    created_at: '',
  },
  title: 'POC – Cycling Boxer',
  description: 'Cykelbyxor använda 1 gång. Köpt för 899kr förra sommaren.',
  price: 425,
  category: 'clothing',
  gender: 'men',
  brand: 'POC',
  size: 'L',
  condition: 'good',
  images: [
    'https://picsum.photos/seed/poc1/400/520',
    'https://picsum.photos/seed/poc2/400/520',
  ],
  is_sold: false,
  views: 120,
  likes: 1,
  created_at: '',
};

const RELATED_ADS = [
  { id: 'r1', brand: 'Poc', size: 'L', price: 400, image: 'https://picsum.photos/seed/rel1/300/400' },
  { id: 'r2', brand: 'Poc', size: 'M/L', price: 1000, image: 'https://picsum.photos/seed/rel2/300/400', freeShipping: true },
  { id: 'r3', brand: 'Mystery Box', size: 'S', price: 249, image: 'https://picsum.photos/seed/rel3/300/400' },
];


function DetailRow({
  label,
  value,
  showArrow,
  showInfo,
  colorDot,
}: {
  label: string;
  value: string;
  showArrow?: boolean;
  showInfo?: boolean;
  colorDot?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', width: 100 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: '#374151', flex: 1 }}>{value}</Text>
      {colorDot && (
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colorDot, marginRight: 6, borderWidth: 1, borderColor: '#e5e7eb' }} />
      )}
      {showInfo && <Feather name="info" size={16} color="#9ca3af" style={{ marginLeft: 4 }} />}
      {showArrow && <Feather name="arrow-up-right" size={16} color="#9ca3af" />}
    </View>
  );
}

function Accordion({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
      >
        {icon}
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, marginLeft: 8 }}>{title}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#6b7280" />
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {children}
        </View>
      )}
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
  const listing = MOCK_LISTING;

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Sticky header (visible after scrolling past image) */}
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
            {listing.price} SEK
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, width }}
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
            style={{ position: 'absolute', top: insets.top + 12, left: 16 }}
          >
            <Feather name="arrow-left" size={24} color="#111827" />
          </Pressable>

          {/* Boost button (lime circle) */}
          <View style={{
            position: 'absolute', top: insets.top + 8, right: 16,
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: '#e4ff3a',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="rocket" size={20} color="#111827" />
          </View>

          {/* Right-side action buttons */}
          <View style={{ position: 'absolute', right: 16, bottom: 56, gap: 10 }}>
            <Pressable
              onPress={() => setPinned(!pinned)}
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 }}
            >
              <Feather name="bookmark" size={20} color={pinned ? '#6C47FF' : '#111827'} />
              <Text style={{ fontSize: 11, color: '#374151', marginTop: 1 }}>{pinned ? 1 : 0}</Text>
            </Pressable>
            <Pressable
              onPress={() => setLiked(!liked)}
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 }}
            >
              <Feather name="heart" size={20} color={liked ? '#ef4444' : '#111827'} />
              <Text style={{ fontSize: 11, color: '#374151', marginTop: 1 }}>{liked ? listing.likes + 1 : listing.likes}</Text>
            </Pressable>
            <Pressable
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 }}
            >
              <Ionicons name="sparkles" size={20} color="#111827" />
            </Pressable>
          </View>

          {/* Pagination dots */}
          {listing.images.length > 1 && (
            <View style={{ position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
              {listing.images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === activeImage ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === activeImage ? '#1f2937' : '#d1d5db',
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Title / price / size ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            Liked by <Text style={{ color: '#111827' }}>@sagaost</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', flex: 1 }}>
              {listing.title}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginLeft: 12 }}>
              {listing.price} SEK
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Size </Text>
            <Text style={{ fontSize: 15, color: '#111827' }}>{listing.size}</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 14 }}>Annons</Text>
        </View>


        {/* ── Seller ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>Seller</Text>
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Feather name="user" size={24} color="#9ca3af" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{listing.seller.full_name}</Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>@{listing.seller.username}</Text>
              </View>
              <Pressable
                onPress={() => setFollowed(!followed)}
                style={{ backgroundColor: followed ? '#f3f4f6' : '#111827', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, flexDirection: 'row', alignItems: 'center' }}
              >
                <Feather name="plus" size={13} color={followed ? '#111827' : 'white'} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: followed ? '#111827' : 'white' }}>
                  {followed ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            </View>
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#9ca3af' }}>Last seen</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 1 }}>This week</Text>
            </View>
          </View>
        </View>


        {/* ── Item description ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>Item description</Text>
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
            <Text style={{ fontSize: 14, color: '#374151', lineHeight: 20 }}>{listing.description}</Text>
            <Pressable style={{ marginTop: 6, marginBottom: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#6C47FF' }}>Show translation</Text>
            </Pressable>
            <DetailRow label="Category" value="Clothes" showArrow />
            <DetailRow label="Size" value={listing.size || '–'} />
            <DetailRow label="Condition" value={CONDITION_LABELS[listing.condition] || listing.condition} showInfo />
            <DetailRow label="Color" value="Black" colorDot="#111827" />
            <DetailRow label="Brand" value={listing.brand || '–'} showArrow />
          </View>
        </View>


        {/* ── Contact / Share / Report ── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'space-around' }}>
          {[
            { icon: 'message-circle', label: 'Contact' },
            { icon: 'share-2', label: 'Share' },
            { icon: 'alert-triangle', label: 'Report' },
          ].map(({ icon, label }) => (
            <Pressable key={label} style={{ alignItems: 'center', gap: 6 }} onPress={() => Alert.alert(label)}>
              <Feather name={icon as any} size={20} color="#374151" />
              <Text style={{ fontSize: 13, color: '#374151' }}>{label}</Text>
            </Pressable>
          ))}
        </View>


        {/* ── Accordions ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Accordion
            icon={<Ionicons name="shield" size={20} color="#6C47FF" />}
            title="About buyers protection"
          >
            <Text style={{ fontSize: 13, color: '#6b7280', lineHeight: 20 }}>
              Buyer protection is an insurance that safeguards your purchase. The fee, based on the item's price, allows us to reimburse you if something goes wrong. Report any issue within 24 hours of receiving the package.{' '}
              <Text style={{ textDecorationLine: 'underline' }}>Read more about it here.</Text>
            </Text>
          </Accordion>

          <Accordion
            icon={<Ionicons name="bag-handle" size={20} color="#6C47FF" />}
            title="Buy via Carrinex"
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 6 }}>
              Buy Directly or via Price Offer
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', lineHeight: 20 }}>
              To purchase an item through Carrinex, you can buy the item directly via <Text style={{ fontWeight: '700' }}>Buy</Text> or suggest a price via <Text style={{ fontWeight: '700' }}>Price Offer.</Text> All purchases through Carrinex have discounted and trackable shipping, as well as buyer protection.
            </Text>
          </Accordion>
        </View>

        <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginVertical: 12 }}>Annons</Text>


        {/* ── Related ads ── */}
        <View style={{ paddingTop: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Related ads</Text>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#374151' }}>Show all</Text>
              <Feather name="chevron-right" size={14} color="#374151" />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12 }}>
            {RELATED_ADS.map((item) => (
              <Pressable key={item.id} style={{ flex: 1 }} onPress={() => router.push(`/product/${item.id}`)}>
                <View style={{ position: 'relative', aspectRatio: 3 / 4, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                  <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  {item.freeShipping && (
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 4, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="truck" size={10} color="white" style={{ marginRight: 3 }} />
                      <Text style={{ fontSize: 10, color: 'white', fontWeight: '600' }}>Free shipping</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: '#374151', marginTop: 4 }} numberOfLines={1}>
                  {item.brand} <Text style={{ fontWeight: '700' }}>{item.size}</Text>
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{item.price} SEK</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: '#e4ff3a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>See more</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Fixed bottom bar ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'white',
        borderTopWidth: 1, borderTopColor: '#f3f4f6',
        paddingHorizontal: 16, paddingTop: 12,
        paddingBottom: insets.bottom || 16,
        flexDirection: 'row', gap: 12,
      }}>
        <Pressable
          onPress={() => Alert.alert('Price suggestion', 'Enter your offer')}
          style={{ flex: 1, borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>Price suggestion</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('Buy', 'Payment flow coming soon')}
          style={{ flex: 1, backgroundColor: '#4ade80', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Buy</Text>
        </Pressable>
      </View>
    </View>
  );
}
