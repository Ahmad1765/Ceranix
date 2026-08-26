// ─────────────────────────────────────────────────────────────────────────────
// PROFILE LISTING TABS (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Segmented Grid Navigation & Playlist Filtering
// Houses the TikTok-style 4-segment tab bar, horizontal save list playlists,
// and tailored empty state messages.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/lib/theme';
import { EmptyState } from '@/components/ui';
import type { SaveList } from '@/lib/saves';

export type ProfileTab = 'selling' | 'liked' | 'collections' | 'details';

type ProfileListingTabsProps = {
  activeTab: ProfileTab;
  setActiveTab: (t: ProfileTab) => void;
  activeListId: string | null;
  setActiveListId: (id: string | null) => void;
  sellingCount: number;
  savedCount: number;
  saveLists: SaveList[];
  onCreateList: () => void;
  onManageList: (l: SaveList) => void;
  loadingListings: boolean;
  gridListingsCount: number;
  onPostItem: () => void;
};

export const ProfileListingTabs = memo(function ProfileListingTabs({
  activeTab,
  setActiveTab,
  activeListId,
  setActiveListId,
  sellingCount,
  savedCount,
  saveLists,
  onCreateList,
  onManageList,
  loadingListings,
  gridListingsCount,
  onPostItem,
}: ProfileListingTabsProps) {
  return (
    <>
      {/* ── 4-Segment Icon Tab Bar ── */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          marginTop: 18,
        }}
      >
        {/* Tab 1: Video Grid / Selling */}
        <Pressable
          onPress={() => setActiveTab('selling')}
          accessibilityRole="tab"
          accessibilityLabel="Selling"
          accessibilityState={{ selected: activeTab === 'selling' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons
              name="grid-outline"
              size={20}
              color={activeTab === 'selling' ? colors.ink : colors.mute}
            />
            <Ionicons
              name="caret-down-outline"
              size={10}
              color={activeTab === 'selling' ? colors.ink : colors.mute}
            />
          </View>
          {activeTab === 'selling' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>

        {/* Tab 2: Liked */}
        <Pressable
          onPress={() => setActiveTab('liked')}
          accessibilityRole="tab"
          accessibilityLabel="Liked"
          accessibilityState={{ selected: activeTab === 'liked' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <Ionicons
            name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
            size={21}
            color={activeTab === 'liked' ? colors.ink : colors.mute}
          />
          {activeTab === 'liked' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>

        {/* Tab 3: Saved / Collections */}
        <Pressable
          onPress={() => setActiveTab('collections')}
          accessibilityRole="tab"
          accessibilityLabel="Collections"
          accessibilityState={{ selected: activeTab === 'collections' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <Ionicons
            name={activeTab === 'collections' ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={activeTab === 'collections' ? colors.ink : colors.mute}
          />
          {activeTab === 'collections' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>

        {/* Tab 4: Details / Credentials */}
        <Pressable
          onPress={() => setActiveTab('details')}
          accessibilityRole="tab"
          accessibilityLabel="Details"
          accessibilityState={{ selected: activeTab === 'details' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <Ionicons
            name={activeTab === 'details' ? 'person' : 'person-outline'}
            size={20}
            color={activeTab === 'details' ? colors.ink : colors.mute}
          />
          {activeTab === 'details' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>
      </View>

      {/* ── Playlist / Category Chips Strip ── */}
      {(activeTab === 'selling' || activeTab === 'collections') && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => setActiveListId(null)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: activeListId === null ? colors.purple : colors.surface,
              borderWidth: 1,
              borderColor: activeListId === null ? colors.purple : colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name="play-circle-outline"
              size={16}
              color={activeListId === null ? '#FFFFFF' : colors.ink}
            />
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: activeListId === null ? '#FFFFFF' : colors.ink,
              }}
            >
              All Items
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: activeListId === null ? 'rgba(255,255,255,0.85)' : colors.mute,
                fontWeight: '600',
              }}
            >
              {activeTab === 'collections' ? savedCount : sellingCount}
            </Text>
          </Pressable>

          {activeTab === 'collections' &&
            saveLists.map((list) => {
              const isListActive = activeListId === list.id;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => setActiveListId(list.id)}
                  onLongPress={() => onManageList(list)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: isListActive ? colors.purple : colors.surface,
                    borderWidth: 1,
                    borderColor: isListActive ? colors.purple : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons
                    name="play-circle-outline"
                    size={16}
                    color={isListActive ? '#FFFFFF' : colors.ink}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isListActive ? '#FFFFFF' : colors.ink,
                    }}
                  >
                    {list.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: isListActive ? 'rgba(255,255,255,0.85)' : colors.mute,
                      fontWeight: '600',
                    }}
                  >
                    {list.item_count ?? 0}
                  </Text>
                </Pressable>
              );
            })}

          {activeTab === 'collections' && (
            <Pressable
              onPress={onCreateList}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="plus" size={16} color={colors.ink} />
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* ── Empty States for Lists ── */}
      {activeTab !== 'details' &&
        (loadingListings ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.purple} />
          </View>
        ) : gridListingsCount === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <EmptyState
              icon={
                activeTab === 'liked'
                  ? 'heart'
                  : activeTab === 'collections'
                    ? 'bookmark'
                    : 'shopping-bag'
              }
              title={
                activeTab === 'liked'
                  ? 'No liked items'
                  : activeTab === 'collections'
                    ? 'No saved items'
                    : 'Your shop is empty'
              }
              description={
                activeTab === 'selling'
                  ? 'Post your first item — takes less than a minute.'
                  : 'Items you interact with will show up here.'
              }
              cta={
                activeTab === 'selling'
                  ? {
                      label: 'Post an item',
                      icon: 'plus',
                      onPress: onPostItem,
                    }
                  : undefined
              }
            />
          </View>
        ) : null)}
    </>
  );
});
