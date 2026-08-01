import { View, Pressable, ScrollView } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii } from '@/lib/theme';

type Tab<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  count?: number;
};

type PillProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'pill' | 'underline';
};

export function Tabs<T extends string>({ tabs, value, onChange, variant = 'pill' }: PillProps<T>) {
  if (variant === 'underline') {
    return (
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <Pressable
              key={t.value}
              onPress={() => onChange(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t.label}${typeof t.count === 'number' && t.count > 0 ? ', ' + t.count + ' items' : ''}`}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 12,
                position: 'relative',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {t.icon && (
                  <Feather
                    name={t.icon}
                    size={14}
                    color={active ? colors.ink2 : colors.muteSoft}
                  />
                )}
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: active ? '800' : '600',
                    color: active ? colors.ink2 : colors.muteSoft,
                  }}
                >
                  {t.label}
                </Text>
                {typeof t.count === 'number' && t.count > 0 && (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: active ? colors.pinkDeep : colors.muteSoft,
                    }}
                  >
                    {t.count}
                  </Text>
                )}
              </View>
              {active && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    height: 2.5,
                    width: 36,
                    backgroundColor: colors.ink,
                    borderRadius: 2,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${t.label}${typeof t.count === 'number' && t.count > 0 ? ', ' + t.count + ' items' : ''}`}
            style={({ pressed }) => ({
              paddingHorizontal: 20,
              paddingVertical: 9,
              borderRadius: radii.pill,
              backgroundColor: active ? colors.primarySoft : colors.surface,
              borderColor: active ? colors.primary : '#E5E5E5',
              borderWidth: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '500',
                color: active ? colors.ink : colors.mute,
              }}
            >
              {t.label}
            </Text>
            {typeof t.count === 'number' && t.count > 0 && (
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 999,
                  backgroundColor: active ? colors.primary : colors.panel,
                  minWidth: 18,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: active ? colors.white : colors.ink,
                  }}
                >
                  {t.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
