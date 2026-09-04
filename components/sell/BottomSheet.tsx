import { View, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { radii, type } from '@/lib/theme';
import * as Haptics from 'expo-haptics';

const DISPLAY_BOLD = type.family.sansBold;

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}

// Shared bottom-sheet shell for sell-flow row pickers (Category, Brand,
// Condition, Colors, Price, Parcel size…)
export function BottomSheet({ visible, title, onClose, children, footer, scroll = true }: Props) {
  const { theme } = useTheme();
  const Content = scroll ? ScrollView : View;

  const handleClose = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={handleClose}
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: radii['3xl'],
            borderTopRightRadius: radii['3xl'],
            borderTopWidth: 1,
            borderColor: theme.border,
            paddingTop: 12,
            maxHeight: '88%',
          }}
        >
          {/* Grab handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 38,
              height: 4.5,
              borderRadius: 3,
              backgroundColor: theme.border,
              marginBottom: 14,
            }}
          />

          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontFamily: DISPLAY_BOLD, fontSize: 18, color: theme.ink, letterSpacing: -0.3 }}>
              {title}
            </Text>
            <Pressable
              hitSlop={12}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: pressed ? theme.panel : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Feather name="x" size={19} color={theme.mute} />
            </Pressable>
          </View>

          <Content
            {...(scroll
              ? { showsVerticalScrollIndicator: false, keyboardShouldPersistTaps: 'handled' as const }
              : {})}
            contentContainerStyle={scroll ? { paddingHorizontal: 20, paddingBottom: 20 } : undefined}
          >
            {scroll ? children : <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>{children}</View>}
          </Content>

          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

