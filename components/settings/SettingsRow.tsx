// The settings page's row vocabulary: a collapsible card, the rows that live
// inside it, and the hairline between them.
//
// These are deliberately NOT components/ui/ListRow. That one owns its own
// horizontal padding (SectionCard supplies it here), uses a pressed background
// wash rather than opacity, defaults chevron to true, has no `loading` state,
// and resolves `destructive` through colors.red — which lib/theme.ts aliases to
// ink. Rendering "Delete account" in the same black as "Change password" would
// drop the only pre-click signal that one of them is irreversible.
//
// Reconciling the two row components is worth doing, but it is its own change
// with its own blast radius (app/(tabs)/profile.tsx is ListRow's consumer).
import { View, Pressable, Switch, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
import { tap } from '@/lib/haptics';

export function SectionCard({
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: 'white',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: expanded ? colors.ink : colors.hairline,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: expanded ? colors.primary : colors.white,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
          }}
        >
          <Feather name={icon} size={18} color={expanded ? '#FFFFFF' : colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: colors.smoke, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={expanded ? 'minus' : 'plus'} size={14} color={colors.ink} />
        </View>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 4,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

export function Row({
  label,
  desc,
  onPress,
  chevron,
  destructive,
  disabled,
  loading,
  badge,
}: {
  label: string;
  desc?: string;
  onPress?: () => void;
  chevron?: boolean;
  /** Irreversible actions only — paints the row in colors.danger. */
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
}) {
  const tone = destructive ? colors.danger : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: tone }}>{label}</Text>
          {badge && (
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 }}>
                {badge.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {desc && <Text style={{ fontSize: 12, color: colors.smoke, marginTop: 3 }}>{desc}</Text>}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={destructive ? colors.danger : colors.smoke} />
      ) : chevron ? (
        <Feather name="chevron-right" size={16} color={destructive ? colors.danger : colors.smoke} />
      ) : null}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  desc,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{label}</Text>
        {desc && <Text style={{ fontSize: 12, color: colors.smoke, marginTop: 3 }}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap('light');
          onValueChange(v);
        }}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: 'rgba(15,15,15,0.12)', true: colors.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="rgba(15,15,15,0.12)"
      />
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.hairline }} />;
}
