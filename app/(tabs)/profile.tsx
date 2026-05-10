import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ListingCard } from '@/components/ListingCard';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { fetchUserListings, fetchLikedListings } from '@/lib/listings';
import type { Listing } from '@/types';

type ProfileTab = 'Selling' | 'Seller mode' | 'Liked' | 'Collections';

const SELLER_MODE_ITEMS = [
  {
    title: 'My shop',
    subtitle: 'View purchased and sold items and handle payouts',
  },
  {
    title: 'Bundle discount',
    subtitle: 'Give your buyers a discount when purchasing multiple items to increase your chances of selling more items',
    badge: 'Off',
  },
  {
    title: 'Vacation mode',
    subtitle: 'Turn the vacation mode on if you want your ads to not be purchasable whilst you are on vacation',
    badge: 'Off',
  },
  {
    title: 'Share your profile',
    subtitle: 'Send your profile to your friends to reach more potential buyers',
  },
];

function ProfileScreenInner() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('Selling');
  const [selling, setSelling] = useState<Listing[]>([]);
  const [liked, setLiked] = useState<Listing[]>([]);
  const [loadingSelling, setLoadingSelling] = useState(true);
  const [loadingLiked, setLoadingLiked] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: ProfileTab[] = ['Selling', 'Seller mode', 'Liked', 'Collections'];

  const loadSelling = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingSelling(true);
    const rows = await fetchUserListings(profile.id);
    setSelling(rows);
    setLoadingSelling(false);
  }, [profile?.id]);

  const loadLiked = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingLiked(true);
    const rows = await fetchLikedListings(profile.id);
    setLiked(rows);
    setLoadingLiked(false);
  }, [profile?.id]);

  useEffect(() => {
    loadSelling();
    loadLiked();
  }, [loadSelling, loadLiked]);

  // Re-fetch when tab regains focus (covers post-publish nav back).
  useFocusEffect(
    useCallback(() => {
      loadSelling();
      loadLiked();
    }, [loadSelling, loadLiked]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSelling(), loadLiked()]);
    setRefreshing(false);
  }, [loadSelling, loadLiked]);

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#6C47FF" />
      </SafeAreaView>
    );
  }

  const sellingCount = selling.length;
  const likedCount = liked.length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />}
      >
        {/* Banner */}
        <View
          style={{
            height: 160,
            backgroundColor: '#c8f53a',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Image
            source={require('../../assets/images/profile_banner_new.png')}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />

          {/* Top-right action stack */}
          <View style={{ position: 'absolute', top: 12, right: 16, flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push('/profile/edit')}
              className="bg-white rounded-full p-2 shadow-sm"
            >
              <Feather name="edit-2" size={18} color="#000" />
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              className="bg-white rounded-full p-2 shadow-sm"
            >
              <Feather name="settings" size={20} color="#000" />
            </Pressable>
          </View>

          {/* User Info inside Banner */}
          <View style={{ position: 'absolute', bottom: 15, left: 16, flexDirection: 'row', alignItems: 'center' }}>
            <View className="w-24 h-24 rounded-full bg-[#d1d5db] border-[4px] border-white/40 items-center justify-center overflow-hidden">
              {profile.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <View className="w-full h-full bg-[#cbd5e1] items-center justify-center">
                  <Feather name="user" size={48} color="#94a3b8" style={{ marginTop: 12 }} />
                </View>
              )}
            </View>
            <View className="ml-4">
              <Text className="text-[24px] font-bold text-white" style={{ letterSpacing: -0.5 }}>
                {profile.full_name || profile.username}
              </Text>
              <Text className="text-[15px] font-medium text-white/90">@{profile.username}</Text>
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View className="flex-row px-4 mt-8 mb-4 items-center" style={{ justifyContent: 'space-between' }}>
          <View className="items-center flex-1">
            <View className="flex-row items-center">
              <Feather name="heart" size={16} color="#ef4444" />
              <Text className="text-[17px] font-bold text-gray-900 ml-1">
                {Number(profile.rating ?? 0).toFixed(1)}
              </Text>
            </View>
            <Text className="text-[12px] text-gray-400 font-medium">{profile.total_sales ?? 0} qty.</Text>
          </View>
          <View style={{ width: 1, height: 35, backgroundColor: '#f3f4f6' }} />
          <View className="items-center flex-1">
            <Text className="text-[17px] font-bold text-gray-900">Today</Text>
            <Text className="text-[12px] text-gray-400 font-medium">Last seen</Text>
          </View>
          <View style={{ width: 1, height: 35, backgroundColor: '#f3f4f6' }} />
          <View className="items-center flex-1">
            <Text className="text-[17px] font-bold text-gray-900">0</Text>
            <Text className="text-[12px] text-gray-400 font-medium">Followers</Text>
          </View>
          <View style={{ width: 1, height: 35, backgroundColor: '#f3f4f6' }} />
          <View className="items-center flex-1">
            <Text className="text-[17px] font-bold text-gray-900">0</Text>
            <Text className="text-[12px] text-gray-400 font-medium">Follows</Text>
          </View>
        </View>

        {/* Tab pills */}
        <View className="mt-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {tabs.map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`px-6 py-2.5 rounded-full border ${
                  activeTab === tab
                    ? 'bg-[#4338ca] border-[#4338ca]'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <Text
                  className={`text-[15px] font-bold ${
                    activeTab === tab ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {tab === 'Selling'
                    ? `Selling (${sellingCount})`
                    : tab === 'Liked'
                    ? `Liked (${likedCount})`
                    : tab === 'Collections'
                    ? `Collections (0)`
                    : tab}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Promote banner */}
        <Pressable className="mt-6 bg-[#e4ff3a] py-3 flex-row items-center justify-center">
          <MaterialCommunityIcons name="rocket" size={20} color="#000" style={{ marginRight: 8 }} />
          <Text className="text-[15px] font-bold text-gray-900">
            Promote your profile <Text className="underline font-black">here</Text>
          </Text>
        </Pressable>

        {/* Tab content */}
        <View className="mt-6">
          {activeTab === 'Selling' && (
            loadingSelling ? (
              <View className="px-4 py-12 items-center">
                <ActivityIndicator color="#6C47FF" />
              </View>
            ) : selling.length === 0 ? (
              <View className="px-4 py-12">
                <Text className="text-4xl font-black tracking-tight text-gray-900">Appears empty{'\n'}here...</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap px-3 justify-between">
                {selling.map((item) => (
                  <View key={item.id} style={{ width: '48%', marginBottom: 12 }}>
                    <ListingCard listing={item} />
                  </View>
                ))}
              </View>
            )
          )}

          {activeTab === 'Seller mode' && (
            <View className="px-4 pt-2">
              <Text className="text-[18px] font-bold text-gray-900 mb-4">Handle your shop</Text>
              <View className="rounded-2xl border border-gray-100 overflow-hidden shadow-sm bg-white">
                {SELLER_MODE_ITEMS.map((item, i) => (
                  <Pressable
                    key={i}
                    className={`flex-row items-center px-5 py-5 ${
                      i < SELLER_MODE_ITEMS.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-[16px] font-normal text-gray-900">{item.title}</Text>
                        {item.badge && (
                          <Text className="ml-2 text-sm text-[#ef4444] font-normal">{item.badge}</Text>
                        )}
                      </View>
                      <Text className="text-sm text-gray-500 mt-1 leading-5">{item.subtitle}</Text>
                    </View>
                    <Feather name="chevron-right" size={24} color="#6b7280" />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {activeTab === 'Liked' && (
            loadingLiked ? (
              <View className="px-4 py-12 items-center">
                <ActivityIndicator color="#6C47FF" />
              </View>
            ) : liked.length === 0 ? (
              <View className="px-4 py-12">
                <Text className="text-4xl font-black tracking-tight text-gray-900">Appears empty{'\n'}here...</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap px-3 justify-between">
                {liked.map((item) => (
                  <View key={item.id} style={{ width: '48%', marginBottom: 12 }}>
                    <ListingCard listing={item} />
                  </View>
                ))}
              </View>
            )
          )}

          {activeTab === 'Collections' && (
            <View className="px-4 py-8">
              <View className="items-center mb-10">
                <Text style={{ fontSize: 24, color: '#c4b5fd', marginBottom: -10, alignSelf: 'center', opacity: 0.5 }}>✦</Text>
                <View style={{ position: 'relative', alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ fontSize: 24, color: '#c4b5fd', position: 'absolute', right: -30, top: 10, opacity: 0.5 }}>✦</Text>
                  <View style={{ width: 180, height: 140, borderTopWidth: 6, borderLeftWidth: 6, borderRightWidth: 6, borderColor: '#6366f1', borderRadius: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                    <View style={{ position: 'absolute', bottom: -6, left: -15, width: 30, height: 6, backgroundColor: '#6366f1', transform: [{ rotate: '-30deg' }] }} />
                    <View style={{ position: 'absolute', bottom: -6, right: -15, width: 30, height: 6, backgroundColor: '#6366f1', transform: [{ rotate: '30deg' }] }} />
                    <Feather name="triangle" size={40} color="#6366f1" style={{ position: 'absolute', top: 10, left: 50, transform: [{ scaleY: -1 }, { rotate: '20deg' }], borderWidth: 3, borderColor: '#6366f1', borderRadius: 2 }} />
                  </View>
                  <View style={{
                    position: 'absolute',
                    bottom: -20,
                    width: 140,
                    height: 40,
                    backgroundColor: '#ddd6fe',
                    borderRadius: 70,
                    transform: [{ scaleY: 0.5 }],
                    zIndex: -1,
                  }} />
                </View>
              </View>
              <Text className="text-4xl font-black tracking-tight text-gray-900 mt-8">Appears empty{'\n'}here...</Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ProfileScreen() {
  return (
    <RequireAuth>
      <ProfileScreenInner />
    </RequireAuth>
  );
}
