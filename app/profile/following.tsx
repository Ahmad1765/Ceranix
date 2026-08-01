import { useCallback, useMemo } from 'react';
import { View, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { getOptimizedImageUrl } from '@/lib/images';
import { colors } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Button, EmptyState } from '@/components/ui';
import {
  useFollowingMaskQuery,
  useFollowingQuery,
  useProfileQuery,
  useToggleFollowInList,
} from '@/lib/queries';
import { fetchFollowing } from '@/lib/follows';

type Row = Awaited<ReturnType<typeof fetchFollowing>>[number];

export default function FollowingScreen() {
  const { user: authUser, profile: authProfile } = useAuth();
  const params = useLocalSearchParams<{ user?: string; username?: string }>();
  const targetId = (typeof params.user === 'string' && params.user) || authUser?.id || '';
  const isSelf = targetId === authUser?.id;
  const toast = useToast();

  const listQuery = useFollowingQuery(targetId);
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  // Sibling query, not a follow-on. This also retires a refetch loop: the old
  // load() listed `headerName` in its useCallback deps, so resolving the name
  // changed load's identity, re-ran useEffect([load]), and re-fetched the whole
  // list a second time on every visit that started without a username param.
  const profileQuery = useProfileQuery(targetId);

  const scope = `following:${targetId}`;
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const maskQuery = useFollowingMaskQuery(authUser?.id ?? null, scope, ids);
  // The cache holds string[] (see useFollowingMaskQuery); rebuild the Set here
  // so row lookups stay O(1).
  const followingSet = useMemo(() => new Set(maskQuery.data ?? []), [maskQuery.data]);

  const toggle = useToggleFollowInList(authUser?.id ?? null, scope, ids);

  // authProfile is only a valid fallback for the viewer's own list — see the
  // matching note in followers.tsx.
  const headerName =
    (typeof params.username === 'string' && params.username) ||
    profileQuery.data?.username ||
    (isSelf ? authProfile?.username : '') ||
    '';

  // A disabled query sits in `pending` forever, so an absent targetId must not
  // read as "still loading".
  const loading = !!targetId && listQuery.isPending;
  const refreshing = listQuery.isRefetching || maskQuery.isRefetching;

  const onRefresh = useCallback(() => {
    listQuery.refetch();
    maskQuery.refetch();
  }, [listQuery, maskQuery]);

  const handleToggle = (row: Row) => {
    if (!authUser) {
      toast.show('Sign in to follow', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    if (row.id === authUser.id || toggle.isPending) return;
    toggle.mutate(
      { id: row.id, currentlyFollowing: followingSet.has(row.id) },
      {
        onError: (e: any) =>
          toast.show(e?.message ?? 'Could not update follow', {
            variant: 'default',
            icon: 'alert-triangle',
          }),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 10,
        }}
      >
        <Pressable onPress={() => safeBack()} hitSlop={HIT_SLOP_8} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {headerName ? `@${headerName}` : 'Following'}
          </Text>
          <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>Following</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="users"
          title={isSelf ? "You're not following anyone yet" : 'Not following anyone'}
          description={
            isSelf
              ? 'Tap Follow on a profile to start building your feed. They’ll show up here.'
              : 'This profile isn’t following anyone yet.'
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingVertical: 4, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
          }
          renderItem={({ item }) => (
            <UserRow
              row={item}
              isFollowing={followingSet.has(item.id)}
              isSelfRow={item.id === authUser?.id}
              busy={toggle.isPending && toggle.variables?.id === item.id}
              onToggle={() => handleToggle(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function UserRow({
  row,
  isFollowing,
  isSelfRow,
  busy,
  onToggle,
}: {
  row: Row;
  isFollowing: boolean;
  isSelfRow: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const avatar = row.avatar_url ? getOptimizedImageUrl(row.avatar_url, { width: 120 }) : null;
  const initial = (row.full_name || row.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={() => router.push(`/user/${row.id}` as any)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.primary }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {row.full_name || row.username}
          </Text>
          {row.is_verified && <Feather name="check-circle" size={12} color={colors.primary} />}
        </View>
        <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 1 }} numberOfLines={1}>
          @{row.username}
        </Text>
      </View>
      {!isSelfRow && (
        <View style={{ marginLeft: 10 }}>
          <Button
            label={isFollowing ? 'Following' : 'Follow'}
            icon={isFollowing ? 'check' : 'user-plus'}
            variant={isFollowing ? 'ghost' : 'primary'}
            size="sm"
            loading={busy}
            onPress={onToggle}
          />
        </View>
      )}
    </Pressable>
  );
}
