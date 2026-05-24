import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

type Props = {
  uri?: string | null;
  size?: number;
  ring?: 'gradient' | 'none' | 'pink';
  initial?: string;
};

export function StoryAvatar({ uri, size = 56, ring = 'gradient', initial }: Props) {
  const innerSize = ring === 'none' ? size : size - 6;
  const inner = (
    <View
      style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: colors.purpleSoft,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : initial ? (
        <Text style={{ fontSize: innerSize * 0.4, fontWeight: '800', color: colors.purple }}>
          {initial.toUpperCase()}
        </Text>
      ) : (
        <Feather name="user" size={innerSize * 0.42} color={colors.muteSoft} />
      )}
    </View>
  );

  if (ring === 'none') return inner;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.purple,
        padding: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {inner}
    </View>
  );
}
