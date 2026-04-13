import { useState } from 'react';
import { View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: string;
}

const MOCK_MESSAGES: Message[] = [
  { id: '1', text: 'Hi, is this still available?', senderId: 'other', timestamp: '10:30 AM' },
  { id: '2', text: 'Yes, it is!', senderId: 'me', timestamp: '10:32 AM' },
  { id: '3', text: 'Would you take 400 SEK for it?', senderId: 'other', timestamp: '10:35 AM' },
];

export default function ConversationScreen() {
  const { id } = useLocalSearchParams();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);

  const sendMessage = () => {
    if (!message.trim()) return;
    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      senderId: 'me',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([...messages, newMessage]);
    setMessage('');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-3">
            <Feather name="chevron-left" size={28} color="black" />
          </Pressable>
          <Image
            source={{ uri: 'https://picsum.photos/seed/user/100/100' }}
            className="w-10 h-10 rounded-full mr-3"
          />
          <View>
            <Text className="text-base font-bold text-black">Sara Ahmed</Text>
            <Text className="text-xs text-gray-500">Active now</Text>
          </View>
        </View>
        <View className="flex-row gap-4">
          <Pressable>
            <Feather name="info" size={22} color="black" />
          </Pressable>
        </View>
      </View>

      {/* Product Context (Optional) */}
      <View className="flex-row items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
        <Image
          source={{ uri: 'https://picsum.photos/seed/prod/100/100' }}
          className="w-10 h-10 rounded-md mr-3"
        />
        <View className="flex-1">
          <Text className="text-sm font-semibold" numberOfLines={1}>Zara Floral Midi Dress</Text>
          <Text className="text-xs text-gray-500">499 SEK</Text>
        </View>
        <Pressable className="bg-black px-4 py-1.5 rounded-full">
          <Text className="text-white text-xs font-bold">Buy</Text>
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            className={`flex-row mb-4 px-4 ${
              item.senderId === 'me' ? 'justify-end' : 'justify-start'
            }`}
          >
            <View
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${
                item.senderId === 'me'
                  ? 'bg-[#5433fb] rounded-tr-none'
                  : 'bg-gray-100 rounded-tl-none'
              }`}
            >
              <Text
                className={`text-[15px] ${
                  item.senderId === 'me' ? 'text-white' : 'text-black'
                }`}
              >
                {item.text}
              </Text>
              <Text
                className={`text-[10px] mt-1 ${
                  item.senderId === 'me' ? 'text-white/70' : 'text-gray-400'
                }`}
              >
                {item.timestamp}
              </Text>
            </View>
          </View>
        )}
        className="flex-1 pt-4"
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View className="flex-row items-center px-4 py-3 border-t border-gray-100 bg-white">
          <Pressable className="mr-3">
            <Feather name="plus-circle" size={24} color="#9CA3AF" />
          </Pressable>
          <View className="flex-1 bg-gray-100 rounded-2xl px-4 py-2 flex-row items-center">
            <TextInput
              placeholder="Write a message..."
              className="flex-1 text-[15px] text-black"
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>
          <Pressable 
            onPress={sendMessage}
            className={`ml-3 w-10 h-10 rounded-full items-center justify-center ${message.trim() ? 'bg-[#5433fb]' : 'bg-gray-200'}`}
          >
            <Ionicons name="send" size={20} color={message.trim() ? 'white' : '#9CA3AF'} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
