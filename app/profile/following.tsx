import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { getOptimizedImageUrl } from '@/lib/images';
import { colors } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Button, EmptyState } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import {
  fetchFollowing,
  fetchFollowingMask,
  toggleFollow,
} from '@/lib/follows';

type Row = Awaited<ReturnType<typeof fetchFollowing>>[number];

export default function FollowingScreen() {
  const { user: authUser, profile: authProfile } = useAuth();
  const params = useLocalSearchParams<{ user?: string; username?: string }>();
  const targetId = (typeof params.user === 'string' && params.user) || authUser?.id || '';
  const isSelf = targetId === authUser?.id;
  const toast = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headerName, setHeaderName] = useState<string>(
    (typeof params.username === 'string' && params.username) || authProfile?.username || '',
  );

  const load = useCallback(async () => {
    if (!targetId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchFollowing(targetId);
      setRows(list);
      const mask = await fetchFollowingMask(authUser?.id ?? null, list.map((r) => r.id));
      setFollowingSet(mask);
      if (!headerName) {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', targetId)
          .maybeSingle();
        if (data?.username) setHeaderName(data.username);
      }
    } finally {
      setLoading(false);
    }
  }, [targetId, authUser?.id, headerName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (row: Row) => {
    if (!authUser) {
      toast.show('Sign in to follow', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    if (row.id === authUser.id || busyId) return;
    const wasFollowing = followingSet.has(row.id);
    setBusyId(row.id);
    // Optimistic flip
    setFollowingSet((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    try {
      const state = await toggleFollow(authUser.id, row.id, wasFollowing);
      setFollowingSet((prev) => {
        const next = new Set(prev);
        if (state.isFollowing) next.add(row.id);
        else next.delete(row.id);
        return next;
      });
    } catch (e: any) {
      // Roll back
      setFollowingSet((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.add(row.id);
        else next.delete(row.id);
        return next;
      });
      toast.show(e?.message ?? 'Could not update follow', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setBusyId(null);
    }
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
          renderItem={({ item }) => (
            <UserRow
              row={item}
              isFollowing={followingSet.has(item.id)}
              isSelfRow={item.id === authUser?.id}
              busy={busyId === item.id}
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
