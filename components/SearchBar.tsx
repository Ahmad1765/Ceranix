import { View, TextInput, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

interface Props {
  placeholder?: string;
  onPress?: () => void;
  editable?: boolean;
  value?: string;
  onChangeText?: (text: string) => void;
}

export function SearchBar({
  placeholder = 'Search Ceranix...',
  onPress,
  editable = false,
  value,
  onChangeText,
}: Props) {
  const content = (
    <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2.5">
      <Feather name="search" size={16} color="#9ca3af" />
      <TextInput
        className="flex-1 ml-2 text-sm text-gray-900"
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        editable={editable}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
      />
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="mx-4 my-2">
        {content}
      </Pressable>
    );
  }

  return <View className="mx-4 my-2">{content}</View>;
}
