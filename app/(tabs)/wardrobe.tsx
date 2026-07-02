// app/(tabs)/wardrobe.tsx — Swipe / My Wardrobe / Liked.
import { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { Tabs } from '@/components/ui/Tabs';
import { SwipeDeck } from '@/components/wardrobe/SwipeDeck';
import { WardrobeGrid } from '@/components/wardrobe/WardrobeGrid';
import { filterUnseen } from '@/lib/wardrobe/deckState';
import type { WardrobePost, SwipeDirection } from '@/lib/wardrobe';
import {
  useWardrobeDeckQuery, useMyWardrobeQuery, useLikedWardrobeQuery,
  useRecordSwipe, useDeleteWardrobePost,
} from '@/lib/queries';
import { useToast } from '@/lib/toast';

type Section = 'swipe' | 'mine' | 'liked';

function WardrobeInner() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [section, setSection] = useState<Section>('swipe');
  const [swiped, setSwiped] = useState<Set<string>>(new Set());

  const deck = useWardrobeDeckQuery(uid);
  const mine = useMyWardrobeQuery(uid);
  const liked = useLikedWardrobeQuery(uid);
  const recordSwipe = useRecordSwipe(uid);
  const deletePost = useDeleteWardrobePost(uid);
  const toast = useToast();

  // Cards not yet swiped in this session (deck refetch may lag the optimistic pop).
  const cards = useMemo(
    () => filterUnseen(deck.data ?? [], swiped),
    [deck.data, swiped],
  );

  const onSwipe = useCallback((post: WardrobePost, dir: SwipeDirection) => {
    setSwiped((prev) => new Set(prev).add(post.id));
    recordSwipe.mutate(
      { postId: post.id, direction: dir },
      {
        onError: () => {
          setSwiped((prev) => {
            const next = new Set(prev);
            next.delete(post.id);
            return next;
          });
          toast.show('Could not save your swipe', { variant: 'info' });
        },
      },
    );
  }, [recordSwipe, toast]);

  const refetchDeck = deck.refetch;
  const onNeedMore = useCallback(() => { refetchDeck(); }, [refetchDeck]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>Wardrobe</Text>
        <Pressable onPress={() => router.push('/wardrobe/new')} hitSlop={10} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#6C47FF', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <Tabs
        variant="underline"
        value={section}
        onChange={(v) => setSection(v as Section)}
        tabs={[
          { value: 'swipe', label: 'Swipe' },
          { value: 'mine', label: 'My Wardrobe' },
          { value: 'liked', label: 'Liked' },
        ]}
      />

      {section === 'swipe' && (
        <View style={{ flex: 1, padding: 20 }}>
          {cards.length > 0 ? (
            <SwipeDeck posts={cards} onSwipe={onSwipe} onNeedMore={onNeedMore} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="check-circle" size={30} color="rgba(15,15,15,0.3)" />
              <Text style={{ marginTop: 10, color: 'rgba(15,15,15,0.5)' }}>
                {deck.isLoading ? 'Loading outfits…' : "You're all caught up"}
              </Text>
            </View>
          )}
        </View>
      )}

      {section === 'mine' && (
        <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
          <WardrobeGrid posts={mine.data ?? []} onDelete={(id) => deletePost.mutate(id)} />
        </ScrollView>
      )}

      {section === 'liked' && (
        <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
          <WardrobeGrid posts={liked.data ?? []} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export default function WardrobeScreen() {
  return (
    <RequireAuth>
      <WardrobeInner />
    </RequireAuth>
  );
}
