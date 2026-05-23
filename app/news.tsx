import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { colors, radii, eyebrow } from '@/lib/theme';
import { useFadeIn } from '@/lib/motion';
import { HIT_SLOP_8 } from '@/lib/responsive';

type NewsTab = 'Following' | 'For you' | 'Searches';
const NEWS_TABS: NewsTab[] = ['Following', 'For you', 'Searches'];

function EmptyBlock({
  icon,
  title,
  description,
  cta,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  cta?: { label: string; onPress: () => void };
}) {
  const fade = useFadeIn(60);
  return (
    <Animated.View style={[{ paddingHorizontal: 20, paddingTop: 36 }, fade]}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.hair,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <Feather name={icon} size={22} color={colors.ink} />
      </View>
      <Text
        style={{
          fontSize: 32,
          fontWeight: '900',
          color: colors.ink,
          lineHeight: 34,
          letterSpacing: -1,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: colors.mute,
          marginTop: 10,
          lineHeight: 19,
          maxWidth: 320,
        }}
      >
        {description}
      </Text>
      {cta && (
        <Pressable
          onPress={cta.onPress}
          style={({ pressed }) => ({
            marginTop: 20,
            alignSelf: 'flex-start',
            backgroundColor: colors.ink,
            borderRadius: radii.xl,
            paddingHorizontal: 18,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Feather name="search" size={14} color={colors.lime} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.white }}>{cta.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

export default function NewsScreen() {
  const [activeTab, setActiveTab] = useState<NewsTab>('Following');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.soft }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.hair,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Feather name="arrow-left" size={18} color={colors.ink} />
        </Pressable>
        <Text style={eyebrow}>News</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Hero */}
      <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
        <Text
          style={{
            fontSize: 36,
            fontWeight: '900',
            color: colors.ink,
            lineHeight: 38,
            letterSpacing: -1.2,
          }}
        >
          What's new.
        </Text>
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime, marginRight: 10 }} />
          <Text style={{ fontSize: 13, color: colors.mute, flex: 1, lineHeight: 19 }}>
            Activity from people you follow and items you've saved.
          </Text>
        </View>
      </View>

      {/* Tab pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        style={{ flexGrow: 0 }}
      >
        {NEWS_TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: radii.pill,
                backgroundColor: active ? colors.ink : colors.white,
                borderWidth: 1.5,
                borderColor: active ? colors.ink : colors.hair,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: active ? colors.white : colors.ink }}>
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Content */}
      {activeTab === 'Following' && (
        <EmptyBlock
          icon="users"
          title={'Quiet on\nthis side.'}
          description="Once people you follow post or sell, you'll see it here."
        />
      )}
      {activeTab === 'For you' && (
        <EmptyBlock
          icon="bell"
          title={'Nothing\nfor you yet.'}
          description="We'll surface listings you'll love based on the things you save and search."
        />
      )}
      {activeTab === 'Searches' && (
        <EmptyBlock
          icon="bookmark"
          title={'No saved\nsearches.'}
          description="Save a search you can't quite find a match for — we'll alert you when something lands."
          cta={{ label: 'Search now', onPress: () => router.push('/(tabs)/discover') }}
        />
      )}
    </SafeAreaView>
  );
}
