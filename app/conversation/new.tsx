import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

export default function NewConversationScreen() {
  const { listing: listingId, seller: sellerId } = useLocalSearchParams();
  const [message, setMessage] = useState('');

  // In a real app, we'd fetch listing and seller details here
  
  const sendMessage = () => {
    if (!message.trim()) return;
    // Mock sending message and redirecting to the conversation
    router.replace(`/conversation/new_chat_id` as any);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Feather name="x" size={28} color="black" />
        </Pressable>
        <Text className="text-lg font-bold text-black">New Message</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {/* Recipient Info */}
        <View className="flex-row items-center mb-6">
          <Text className="text-gray-500 mr-2">To:</Text>
          <View className="flex-row items-center bg-gray-100 rounded-full px-3 py-1.5">
            <Image
              source={{ uri: 'https://picsum.photos/seed/user/100/100' }}
              className="w-5 h-5 rounded-full mr-2"
            />
            <Text className="text-sm font-semibold">Sara Ahmed</Text>
          </View>
        </View>

        {/* Product Info Card */}
        <View className="bg-gray-50 rounded-2xl p-4 flex-row items-center mb-6 border border-gray-100">
          <Image
            source={{ uri: 'https://picsum.photos/seed/prod/200/200' }}
            className="w-16 h-16 rounded-xl mr-4"
          />
          <View className="flex-1">
            <Text className="text-base font-bold text-black" numberOfLines={1}>Zara Floral Midi Dress</Text>
            <Text className="text-sm text-gray-500">499 SEK · Size S</Text>
            <Text className="text-sm text-gray-900 mt-1 font-semibold">Condition: Like new</Text>
          </View>
        </View>

        <Text className="text-sm font-semibold text-gray-900 mb-2">Message</Text>
        <View className="bg-gray-50 rounded-2xl p-4 border border-gray-200 min-h-[150px]">
          <TextInput
            placeholder="Type your message here..."
            className="text-[16px] text-black"
            value={message}
            onChangeText={setMessage}
            multiline
            autoFocus
            textAlignVertical="top"
          />
        </View>

        <View className="mt-4">
          <Text className="text-xs text-gray-400">
            Be kind and respectful. Use Carrinex's payment system for a safe transaction. 
          </Text>
        </View>
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View className="px-4 py-4 border-t border-gray-100 bg-white">
          <Pressable 
            onPress={sendMessage}
            className={`w-full py-4 rounded-xl items-center justify-center ${message.trim() ? 'bg-[#e4ff3a]' : 'bg-gray-100'}`}
          >
            <Text className={`font-bold text-base ${message.trim() ? 'text-black' : 'text-gray-400'}`}>
              Send Message
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
