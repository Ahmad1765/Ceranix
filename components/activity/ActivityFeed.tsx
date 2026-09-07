import { useCallback, useMemo } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { router, useFocusEffect } from 'expo-router';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useInboxQuery } from '@/lib/queries';
import { isSupportConversation } from '@/lib/support';
import { type ConversationRow } from '@/lib/chat';
import { InboxRow } from '@/components/chat/InboxRow';

const EMPTY_CONVERSATIONS: ConversationRow[] = [];

type Props = {
  bottomInset?: number;
};

export function ActivityFeed({ bottomInset = 24 }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const inboxQ = useInboxQuery(userId);
  const conversations = inboxQ.data ?? EMPTY_CONVERSATIONS;

  // Filter direct profile messages:
  // Activity is strictly for people who message you directly — NOT for buying or giving offers
  const directMessages = useMemo(() => {
    const isOffer = (c: ConversationRow) => {
      const msg = c.last_message?.trim().toLowerCase() || '';
      return msg.startsWith('offer:') || msg.startsWith('offer ') || msg.includes('offer:');
    };
    return conversations.filter(
      (c) => !c.listing_id && !isSupportConversation(c) && !isOffer(c),
    );
  }, [conversations]);

  const { refetch: inboxRefetch, isStale: inboxStale } = inboxQ;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (inboxStale) inboxRefetch();
    }, [userId, inboxStale, inboxRefetch]),
  );

  const onRefresh = useCallback(async () => {
    await inboxRefetch();
  }, [inboxRefetch]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 30 }}
        refreshControl={
          <RefreshControl
            refreshing={inboxQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        <View style={{ paddingTop: 10 }}>
          {directMessages.length > 0 ? (
            <View>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontFamily: typography.family.sansBold,
                    fontSize: 11.5,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: theme.muteSoft,
                  }}
                >
                  Direct Profile Messages
                </Text>
                <Text
                  style={{
                    fontFamily: typography.family.sansMedium,
                    fontSize: 12,
                    color: theme.primary,
                  }}
                >
                  {directMessages.length} {directMessages.length === 1 ? 'chat' : 'chats'}
                </Text>
              </View>

              {directMessages.map((conv) => (
                <View key={conv.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                  <InboxRow
                    conv={conv}
                    userId={userId || ''}
                    onPress={() => router.push(`/conversation/${conv.id}` as any)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="users"
              title="Quiet on this side"
              description="When you message creators directly through their profile or people you follow post, they'll appear here."
              cta={{
                label: 'Find Sellers to Follow',
                icon: 'search',
                onPress: () => router.push('/' as any),
              }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
