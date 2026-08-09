import { View, Pressable } from 'react-native';
import { TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';

interface Props {
  placeholder?: string;
  onPress?: () => void;
  editable?: boolean;
  value?: string;
  onChangeText?: (text: string) => void;
}

export function SearchBar({
  placeholder = 'Search Carrinex...',
  onPress,
  editable = false,
  value,
  onChangeText,
}: Props) {
  const content = (
    <View className="flex-row items-center bg-ink-panel rounded-xl px-3 py-2.5">
      <Feather name="search" size={16} color="rgba(15,15,15,0.55)" />
      <TextInput
        className="flex-1 ml-2 text-sm text-ink"
        placeholder={placeholder}
        placeholderTextColor="rgba(15,15,15,0.55)"
        editable={editable}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
      />
    </View>
  );

  if (onPress) {
    return (
      // Inline style, not className: Pressable is deliberately excluded from
      // NativeWind's cssInterop (see lib/pressableInterop.ts), so className
      // does nothing here. Mirrors the `mx-4 my-2` on the View below.
      <Pressable onPress={onPress} style={{ marginHorizontal: 16, marginVertical: 8 }}>
        {content}
      </Pressable>
    );
  }

  return <View className="mx-4 my-2">{content}</View>;
}
