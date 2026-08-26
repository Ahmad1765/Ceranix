// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION BLOCKED BANNER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: State-Driven Status Banners
// Instead of cluttering the main screen with inline conditionals for blocked
// vs unblocked vs loading states, this component encapsulates the banner UI.
// ─────────────────────────────────────────────────────────────────────────────

import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { colors, radii, type as typography } from '@/lib/theme';
import type { BlockStatus } from './useConversationBlock';

type ConversationBlockedBannerProps = {
  blockStatus: BlockStatus;
  onUnblock: () => void;
};

export function ConversationBlockedBanner({
  blockStatus,
  onUnblock,
}: ConversationBlockedBannerProps) {
  if (blockStatus === 'blocked') {
    return (
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.panel,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 13,
            color: colors.muteSoft,
            flex: 1,
            marginRight: 12,
          }}
        >
          You have blocked this user.
        </Text>
        <Pressable
          onPress={onUnblock}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: radii.pill,
            backgroundColor: colors.ink,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: typography.family.sansSemibold,
              fontSize: 12,
              color: colors.white,
            }}
          >
            Unblock
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 13,
          color: colors.muteSoft,
        }}
      >
        {blockStatus === 'loading' ? 'Checking conversation status…' : 'Messaging is unavailable.'}
      </Text>
    </View>
  );
}
