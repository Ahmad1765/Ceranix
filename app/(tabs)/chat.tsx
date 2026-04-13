import { useState } from 'react';
import { View, Text, FlatList, Pressable, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Conversation } from '@/types';

const MOCK_CONVERSATIONS: Conversation[] = [];

type InboxTab = 'Selling' | 'Buying' | 'Social' | 'Support';
const INBOX_TABS: InboxTab[] = ['Selling', 'Buying', 'Social', 'Support'];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function EmptyState() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 100 }}>
      <Text className="text-[17px] text-[#111827]">Seems to be empty here 🤷‍♂️</Text>
      <Pressable className="mt-8">
        <Text className="text-[17px] font-bold text-black text-center">Try again</Text>
      </Pressable>
    </View>
  );
}

export default function InboxScreen() {
  const [activeTab, setActiveTab] = useState<InboxTab>('Selling');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2 bg-white">
        <Pressable>
          <Feather name="more-horizontal" size={24} color="#000" />
        </Pressable>
        <Text className="text-[17px] font-bold text-black">Inbox</Text>
        <Pressable>
          <Feather name="message-circle" size={24} color="#000" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-gray-100 bg-white" style={{ zIndex: 10 }}>
        {INBOX_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
            className="flex-1 items-center pb-3 pt-3"
          >
            <Text
              className={`text-[15px] ${
                activeTab === tab ? 'text-black font-bold' : 'text-[#9CA3AF]'
              }`}
            >
              {tab}
            </Text>
            {activeTab === tab && (
              <View
                style={{
                  position: 'absolute',
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 3,
                  backgroundColor: '#000',
                  zIndex: 11,
                }}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View className="flex-1 overflow-hidden">
        {MOCK_CONVERSATIONS.length === 0 ? (
          <EmptyState key={activeTab} />
        ) : (
          <FlatList
            data={MOCK_CONVERSATIONS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/conversation/${item.id}` as any)}
                className="flex-row items-center px-4 py-3 border-b border-gray-50"
              >
                <View className="relative mr-3">
                  <Image
                    source={{ uri: item.other_user.avatar_url ?? undefined }}
                    className="w-12 h-12 rounded-full bg-gray-200"
                    contentFit="cover"
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row justify-between items-baseline">
                    <Text className="text-sm font-semibold text-gray-900">
                      {item.other_user.username}
                    </Text>
                    <Text className="text-xs text-gray-400">{timeAgo(item.updated_at)}</Text>
                  </View>
                  <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                    {item.last_message}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}




