import { memo } from 'react';
import { View, Pressable, FlatList, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useFollowStateQuery, useToggleFollow, useListingLikersQuery } from '@/lib/queries';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { radii } from '@/lib/theme';
import type { ListingLiker } from '@/types';

const FIGTREE_FONT = Platform.OS === 'web' ? 'Figtree, sans-serif' : 'Figtree';

function LikerRow({ liker, onClose }: { liker: ListingLiker; onClose: () => void }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const isSelf = user?.id === liker.user_id;

  const followQ = useFollowStateQuery(user?.id ?? null, liker.user_id);
  const toggleFollowM = useToggleFollow(user?.id ?? null, liker.user_id);
  const isFollowing = followQ.data?.isFollowing ?? false;
  const isPending = toggleFollowM.isPending;

  const handleToggleFollow = (e: any) => {
    e.stopPropagation?.();
    if (!user) {
      toast.show('Sign in to follow creators', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    if (isSelf || isPending) return;
    toggleFollowM.mutate({ currentlyFollowing: isFollowing });
  };

  const handleUserPress = () => {
    onClose();
    if (isSelf) {
      router.push('/(tabs)/profile' as any);
    } else {
      router.push(`/user/${liker.user_id}` as any);
    }
  };

  const initial = (liker.full_name || liker.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={handleUserPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        {liker.avatar_url ? (
          <Image
            source={{ uri: liker.avatar_url }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.panel,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: FIGTREE_FONT, fontSize: 16, fontWeight: '700', color: theme.ink }}>
              {initial}
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 14.5,
                fontWeight: '700',
                color: theme.ink,
                fontFamily: FIGTREE_FONT,
              }}
            >
              {liker.full_name || liker.username}
            </Text>
            {liker.is_verified && <ShieldCheckIcon size={14} />}
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12.5,
              color: theme.mute,
              fontFamily: FIGTREE_FONT,
              marginTop: 1,
            }}
          >
            @{liker.username}
          </Text>
        </View>
      </View>

      {!isSelf && (
        <Pressable
          onPress={handleToggleFollow}
          disabled={isPending}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            height: 30,
            borderRadius: 15,
            backgroundColor: isFollowing ? theme.panel : theme.ink,
            borderWidth: 1,
            borderColor: isFollowing ? theme.border : theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || isPending ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              fontFamily: FIGTREE_FONT,
              color: isFollowing ? theme.ink : theme.background,
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export const LikersSheet = memo(function LikersSheet({
  visible,
  listingId,
  onClose,
}: {
  visible: boolean;
  listingId: string;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { data: likers = [], isLoading } = useListingLikersQuery(visible ? listingId : null);

  return (
    <BottomSheetModal visible={visible} title="Likes" onClose={onClose} autoHeight>
      <View style={{ minHeight: 200, maxHeight: 420 }}>
        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.purple} />
          </View>
        ) : likers.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="heart" size={28} color={theme.mute} />
            <Text
              style={{
                fontFamily: FIGTREE_FONT,
                fontSize: 14,
                color: theme.mute,
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              No likes yet. Be the first to like this item!
            </Text>
          </View>
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LikerRow liker={item} onClose={onClose} />}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 2 }} />
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </BottomSheetModal>
  );
});
