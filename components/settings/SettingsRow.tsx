import { View, Pressable, Switch, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';

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
  const { theme } = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: expanded ? theme.text : theme.border,
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
            backgroundColor: expanded ? theme.accent : theme.panel,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
          }}
        >
          <Feather
            name={icon}
            size={18}
            color={expanded ? (theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF') : theme.text}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text, letterSpacing: -0.2 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: theme.panel,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={expanded ? 'minus' : 'plus'} size={14} color={theme.text} />
        </View>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 4,
            borderTopWidth: 1,
            borderTopColor: theme.border,
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
  /** Irreversible actions only — paints the row in theme.danger. */
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
}) {
  const { theme } = useTheme();
  const tone = destructive ? theme.danger : theme.text;

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
                backgroundColor: theme.accent,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF',
                  letterSpacing: 0.4,
                }}
              >
                {badge.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {desc && <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{desc}</Text>}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={destructive ? theme.danger : theme.textMuted} />
      ) : chevron ? (
        <Feather name="chevron-right" size={16} color={destructive ? theme.danger : theme.textMuted} />
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
  const { theme } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{label}</Text>
        {desc && <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap('light');
          onValueChange(v);
        }}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={theme.accent === '#FFFFFF' ? '#FFFFFF' : '#FFFFFF'}
        ios_backgroundColor={theme.border}
      />
    </View>
  );
}

export function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}
