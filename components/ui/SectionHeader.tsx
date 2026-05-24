import { View, Text, Pressable } from 'react-native';
import { colors } from '@/lib/theme';

type Props = {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
  rightText?: string;
};

export function SectionHeader({ title, count, action, rightText }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '800',
            color: colors.ink2,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
        {typeof count === 'number' && (
          <Text style={{ fontSize: 12, color: colors.smoke, fontWeight: '700' }}>
            {count}
          </Text>
        )}
      </View>
      {action ? (
        <Pressable onPress={action.onPress}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.pinkDeep }}>
            {action.label}
          </Text>
        </Pressable>
      ) : rightText ? (
        <Text style={{ fontSize: 12, color: colors.smoke, fontWeight: '600' }}>{rightText}</Text>
      ) : null}
    </View>
  );
}
