import { View, Pressable, Modal, ScrollView } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, radii, type } from '@/lib/theme';

const DISPLAY_BOLD = type.family.sansBold;

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}

// Shared bottom-sheet shell for every sell-flow row picker (Category, Brand,
// Condition, Colors, Price, Parcel size…) — same shape as FeedFilterSheet so
// sheets across the app stay visually consistent.
export function BottomSheet({ visible, title, onClose, children, footer, scroll = true }: Props) {
  const Content = scroll ? ScrollView : View;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.white,
            borderTopLeftRadius: radii['3xl'],
            borderTopRightRadius: radii['3xl'],
            paddingTop: 12,
            maxHeight: '86%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.hairline,
              marginBottom: 14,
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 6,
            }}
          >
            <Text style={{ fontFamily: DISPLAY_BOLD, fontSize: 18, color: colors.ink, letterSpacing: -0.2 }}>
              {title}
            </Text>
            <Pressable hitSlop={8} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.muteSoft} />
            </Pressable>
          </View>

          <Content
            {...(scroll
              ? { showsVerticalScrollIndicator: false, keyboardShouldPersistTaps: 'handled' as const }
              : {})}
            style={scroll ? undefined : undefined}
            contentContainerStyle={scroll ? { paddingHorizontal: 20, paddingBottom: 16 } : undefined}
          >
            {scroll ? children : <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>{children}</View>}
          </Content>

          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
