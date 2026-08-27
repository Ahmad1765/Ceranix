// One conversation in the inbox.
//
// Three columns, left to right: who you're talking to, what was last said, and
// what it's about. The listing thumbnail carries its own status badge so a
// thread about something already sold reads that way without being opened —
// the single biggest scanning win in a resale inbox.

import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { colors, radii, type as typography } from '@/lib/theme';
import { isConversationUnread, otherParticipant, type ConversationRow } from '@/lib/chat';
import { ListingThumb, listingStatus } from './ListingThumb';
import { relativeTime } from './format';

function InboxRowImpl({
  conv,
  userId,
  onPress,
}: {
  conv: ConversationRow;
  userId: string;
  onPress: () => void;
}) {
  const other = otherParticipant(conv, userId);
  const avatar = other?.avatar_url ? getOptimizedImageUrl(other.avatar_url, { width: 140 }) : null;
  const thumbUrl = conv.listing ? cardImageUrl(conv.listing, 0) : null;
  const thumb = thumbUrl ? getOptimizedImageUrl(thumbUrl, { width: 160 }) : null;

  const unread = isConversationUnread(conv, userId);
  const fromMe = !!conv.last_sender_id && conv.last_sender_id === userId;
  const displayName = other?.full_name || other?.username || 'Unknown';
  const initial = displayName.trim().charAt(0).toUpperCase();
  const preview = conv.last_message
    ? `${fromMe ? 'You: ' : ''}${conv.last_message}`
    : 'Tap to start the conversation';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${displayName}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 19,
              color: colors.purple,
            }}
          >
            {initial}
          </Text>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 15,
            letterSpacing: -0.2,
            color: colors.ink,
          }}
        >
          {displayName}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: unread ? typography.family.sansSemibold : typography.family.sans,
            fontSize: 13.5,
            lineHeight: 19,
            color: unread ? colors.ink : colors.mute,
            marginTop: 1,
          }}
        >
          {preview}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {unread && (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.primary,
              }}
            />
          )}
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 11.5,
              color: colors.muteSoft,
            }}
          >
            {relativeTime(conv.updated_at)}
          </Text>
        </View>
      </View>

      {/* No listing_id means this thread isn't about an item at all — that's a
          missing column, not a removed listing, so nothing renders. */}
      {conv.listing_id && (
        <ListingThumb
          uri={thumb}
          width={52}
          height={66}
          status={listingStatus(conv.listing)}
          radius={radii.sm}
        />
      )}
    </Pressable>
  );
}

export const InboxRow = memo(InboxRowImpl);

/** Placeholder rows for the first load. A skeleton that matches the real row's
 *  geometry beats a centred spinner: the list doesn't jump when data lands. */
export function InboxSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 13,
          }}
        >
          <View
            style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.panel }}
          />
          <View style={{ flex: 1, gap: 7 }}>
            <View
              style={{ height: 12, width: '38%', borderRadius: 6, backgroundColor: colors.panel }}
            />
            <View
              style={{ height: 11, width: '72%', borderRadius: 6, backgroundColor: colors.panel }}
            />
            <View
              style={{ height: 9, width: '24%', borderRadius: 5, backgroundColor: colors.panel }}
            />
          </View>
          <View
            style={{ width: 52, height: 66, borderRadius: radii.sm, backgroundColor: colors.panel }}
          />
        </View>
      ))}
    </View>
  );
}
