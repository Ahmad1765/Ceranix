// A small bottom sheet of actions, shared by the composer's "+" and the
// thread header's overflow button.
//
// Android notes (same recipe as DiscoverSheet/SellSheet): a Modal is its own
// window, so it needs `statusBarTranslucent` + `navigationBarTranslucent` to
// sit under the system bars, and its own SafeAreaProvider — the app-root one
// lives outside this window and would report zero insets in here.

import { Modal, Pressable, View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { colors, radii, type as typography } from '@/lib/theme';

export type ChatAction = {
  id: string;
  label: string;
  /** Optional second line — say what the action does when it isn't obvious. */
  hint?: string;
  icon: keyof typeof Feather.glyphMap;
  /** `primary` tints purple, `destructive` tints red. Everything else stays ink. */
  tone?: 'default' | 'primary' | 'destructive';
  onPress: () => void;
};

export function ChatActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: ChatAction[];
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* The provider has to wrap the backdrop, not sit inside it: its view is
          flex:1 and measures the insets from its own frame, so nesting it in a
          flex-end column would both stretch the sheet and mis-measure. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
        >
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.white }}>
            {/* Swallow taps inside the sheet so they don't reach the backdrop. */}
            <Pressable
              onPress={() => {}}
              style={{
                borderTopLeftRadius: radii['4xl'],
                borderTopRightRadius: radii['4xl'],
                backgroundColor: colors.white,
                paddingTop: 10,
                paddingBottom: 8,
              }}
            >
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.hairline,
                  marginBottom: title ? 14 : 8,
                }}
              />

              {title && (
                <Text
                  style={{
                    fontFamily: typography.family.sansBold,
                    fontSize: 12,
                    letterSpacing: 0.3,
                    color: colors.muteSoft,
                    paddingHorizontal: 20,
                    marginBottom: 4,
                  }}
                >
                  {title}
                </Text>
              )}

              {actions.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  onPress={() => {
                    onClose();
                    a.onPress();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    backgroundColor: pressed ? colors.panel : 'transparent',
                  })}
                >
                  <Feather
                    name={a.icon}
                    size={19}
                    color={
                      a.tone === 'destructive'
                        ? '#DC2626'
                        : a.tone === 'primary'
                        ? colors.primary
                        : colors.ink
                    }
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: typography.family.sansSemibold,
                        fontSize: 15,
                        color: a.tone === 'destructive' ? '#DC2626' : colors.ink,
                      }}
                    >
                      {a.label}
                    </Text>
                    {a.hint && (
                      <Text
                        style={{
                          fontFamily: typography.family.sans,
                          fontSize: 12,
                          color: colors.muteSoft,
                          marginTop: 1,
                        }}
                      >
                        {a.hint}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </SafeAreaProvider>
    </Modal>
  );
}
