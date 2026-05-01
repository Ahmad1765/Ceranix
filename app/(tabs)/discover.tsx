import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

const CATEGORIES = [
  { id: 'more', label: 'See more', bg: 'https://picsum.photos/seed/more/200/200' },
  { id: 'dresses', label: 'Dresses', bg: 'https://picsum.photos/seed/dress/200/200' },
  { id: 'hoodies', label: 'Hoodies', bg: 'https://picsum.photos/seed/hoodie/200/200' },
];

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Search Header */}
      <View className="px-4 py-3">
        <View className="flex-row items-center bg-gray-100 rounded-full px-4 py-3 outline outline-1 outline-gray-200">
          <Feather name="search" size={20} color="#9ca3af" />
          <Text className="ml-3 flex-1 text-[16px] text-gray-400">
            Search for listings or sellers
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Categories */}
        <View className="px-4 pt-2">
          <Text className="text-[18px] font-medium text-gray-900 mb-3">Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {CATEGORIES.map((cat) => (
              <Pressable key={cat.id} className="relative w-28 h-28 rounded-2xl overflow-hidden shadow-sm">
                <Image source={{ uri: cat.bg }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                <View className="absolute inset-0 bg-black/30 items-center justify-center">
                  <Text className="text-white font-bold text-[15px]">{cat.label}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Ready for a challenge? */}
        <View className="px-4 pt-8">
          <View className="flex-row items-center justify-between mb-4 mt-6">
            <Text className="text-[18px] font-medium text-gray-900">Ready for a challenge?</Text>
            <Text className="text-sm font-medium text-gray-600">Show all <Feather name="chevron-right" size={14} /></Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
             <View className="w-72 border border-gray-200 rounded-2xl p-5 flex-row">
               <View className="w-12 h-12 rounded-full border-4 border-indigo-600 items-center justify-center mr-4">
                 <Feather name="check" size={20} color="#4f46e5" />
               </View>
               <View className="flex-1">
                 <Text className="text-[16px] font-bold text-gray-900 mb-1">About you</Text>
                 <Text className="text-[14px] text-gray-700 leading-tight mb-3">
                   Take the first step towards being verified on Carrinex
                 </Text>
                 <View className="flex-row items-center justify-between">
                   <View className="flex-row" style={{gap: 4}}>
                     <View className="h-1.5 w-8 bg-gray-300 rounded-full" />
                     <View className="h-1.5 w-8 bg-gray-300 rounded-full" />
                     <View className="h-1.5 w-8 bg-gray-300 rounded-full" />
                   </View>
                   <Text className="text-xs font-semibold text-gray-500">0/3</Text>
                 </View>
               </View>
             </View>

             <View className="w-72 border border-gray-200 rounded-2xl p-5 flex-row">
               <View className="w-12 h-12 rounded-full bg-indigo-600 items-center justify-center mr-4">
                 <Feather name="user" size={20} color="#ffffff" />
               </View>
               <View className="flex-1">
                 <Text className="text-[16px] font-bold text-gray-900 mb-1">Add details</Text>
                 <Text className="text-[14px] text-gray-700 leading-tight mb-3">
                   Make your profile stand out more!
                 </Text>
               </View>
             </View>
          </ScrollView>
        </View>

        {/* Recommended users */}
        <View className="px-4 pt-10">
          <Text className="text-[18px] font-medium text-gray-900 mb-4">Recommended users</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
             {[1, 2, 3].map((u) => (
                <View key={u} className="w-[160px]">
                  <View className="flex-row flex-wrap rounded-2xl overflow-hidden mb-3" style={{width: 160, height: 160, gap: 2}}>
                    <Image source={{uri: `https://picsum.photos/seed/u${u}a/100/100`}} style={{width: 79, height: 79}} />
                    <Image source={{uri: `https://picsum.photos/seed/u${u}b/100/100`}} style={{width: 79, height: 79}} />
                    <Image source={{uri: `https://picsum.photos/seed/u${u}c/100/100`}} style={{width: 79, height: 79}} />
                    <Image source={{uri: `https://picsum.photos/seed/u${u}d/100/100`}} style={{width: 79, height: 79}} />
                  </View>
                </View>
             ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
