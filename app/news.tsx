import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Tabs, EmptyState } from '@/components/ui';

type NewsTab = 'following' | 'foryou' | 'searches';

export default function NewsScreen() {
  const [activeTab, setActiveTab] = useState<NewsTab>('following');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Activity</Text>
        <Pressable
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="check-square" size={18} color={colors.ink} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={{ marginTop: 12 }}>
        <Tabs
          variant="pill"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: 'following', label: 'Following', icon: 'users' },
            { value: 'foryou', label: 'For you', icon: 'compass' },
            { value: 'searches', label: 'Saved', icon: 'bookmark' },
          ]}
        />
      </View>

      {/* Content */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === 'following' && (
          <EmptyState
            icon="users"
            title="Quiet on this side"
            description="Once people you follow post or sell, you'll see it here."
          />
        )}
        {activeTab === 'foryou' && (
          <EmptyState
            icon="bell"
            title="Nothing for you yet"
            description="We'll surface listings you'll love based on what you save and search."
          />
        )}
        {activeTab === 'searches' && (
          <EmptyState
            icon="bookmark"
            title="No saved searches"
            description="Save a search and we'll alert you when something matches."
            cta={{
              label: 'Search now',
              icon: 'search',
              onPress: () => router.push('/(tabs)/discover'),
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
