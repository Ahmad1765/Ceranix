import { useState } from 'react';
import { View, Text, Pressable, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

type NewsTab = 'Following' | 'For you' | 'Searches';
const NEWS_TABS: NewsTab[] = ['Following', 'For you', 'Searches'];

function FollowingEmpty() {
  return (
    <View className="flex-1 items-center justify-center py-24" />
  );
}

function ForYouEmpty() {
  return (
    <View className="flex-1 items-center justify-center py-24">
      <Feather name="bell" size={40} color="#d1d5db" />
      <Text className="text-base font-semibold text-gray-700 mt-4">Nothing new yet</Text>
      <Text className="text-sm text-gray-400 mt-1 text-center px-8">
        We'll show you notifications about items and people you follow here
      </Text>
    </View>
  );
}

function SearchesEmpty() {
  return (
    <View className="flex-1 items-center justify-center py-12 px-8">
      <Text className="text-3xl font-bold text-gray-900 text-center mb-4">
        No saved searches?
      </Text>
      <Text className="text-sm text-gray-500 text-center leading-5 mb-8">
        Next time you search for something but can't quite find what you're looking for, you can save the search and it'll appear here.
      </Text>
      <Pressable
        onPress={() => router.push('/search')}
        className="w-full border border-gray-300 rounded-2xl py-4 items-center"
      >
        <Text className="text-base font-semibold text-gray-900">Search for ads</Text>
      </Pressable>
    </View>
  );
}

export default function NewsScreen() {
  const [activeTab, setActiveTab] = useState<NewsTab>('Following');

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-1">
        <Pressable onPress={() => router.back()} className="mr-4">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900">News</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-gray-100 px-4 mt-1">
        {NEWS_TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            className="mr-6 pb-2.5"
          >
            <Text
              className={`text-sm font-semibold ${
                activeTab === tab ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {tab}
            </Text>
            {activeTab === tab && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  backgroundColor: '#111827',
                  borderRadius: 2,
                }}
              />
            )}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'Following' && <FollowingEmpty />}
      {activeTab === 'For you' && <ForYouEmpty />}
      {activeTab === 'Searches' && <SearchesEmpty />}
    </SafeAreaView>
  );
}
