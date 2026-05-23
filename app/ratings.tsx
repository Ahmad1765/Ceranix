import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { colors, radii, eyebrow } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';

export default function RatingsScreen() {
  const { profile } = useAuth();
  const rating = Number(profile?.rating ?? 0);
  const sales = profile?.total_sales ?? 0;
  const showStars = Math.max(0, Math.min(5, Math.round(rating)));

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
        <Text style={eyebrow}>Ratings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {/* Hero */}
        <Text
          style={{
            fontSize: 40,
            fontWeight: '900',
            color: colors.ink,
            lineHeight: 42,
            letterSpacing: -1.4,
          }}
        >
          Your{'\n'}reputation.
        </Text>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime, marginRight: 10 }} />
          <Text style={{ fontSize: 13, color: colors.mute, flex: 1, lineHeight: 19 }}>
            How buyers and sellers are rating their experience with you.
          </Text>
        </View>

        {/* Score card */}
        <View
          style={{
            marginTop: 22,
            backgroundColor: colors.ink,
            borderRadius: radii['3xl'],
            padding: 22,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: colors.lime,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            Overall rating
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
            <Text
              style={{
                fontSize: 64,
                fontWeight: '900',
                color: colors.white,
                letterSpacing: -3,
                lineHeight: 64,
              }}
            >
              {rating.toFixed(1)}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.55)', marginLeft: 6 }}>
              / 5
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Feather
                key={i}
                name="star"
                size={18}
                color={i < showStars ? colors.lime : 'rgba(255,255,255,0.18)'}
              />
            ))}
          </View>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 14 }}>
            From {sales} completed {sales === 1 ? 'sale' : 'sales'}
          </Text>
        </View>

        {/* Breakdown placeholder */}
        <View
          style={{
            marginTop: 14,
            backgroundColor: colors.white,
            borderRadius: radii['2xl'],
            borderWidth: 1,
            borderColor: colors.hair,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
            What good ratings unlock
          </Text>
          <Text style={{ fontSize: 12, color: colors.mute, marginTop: 4, lineHeight: 18 }}>
            Reach 4.5+ for buyers' suggested-seller badge, and unlock featured placement after 25 sales.
          </Text>

          <View style={{ marginTop: 14, gap: 10 }}>
            {[
              { icon: 'shield' as const, label: 'Verified by buyers', done: rating >= 4.5 },
              { icon: 'zap' as const, label: 'Featured seller', done: sales >= 25 },
              { icon: 'star' as const, label: 'Top-rated shop', done: rating >= 4.8 && sales >= 50 },
            ].map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: row.done ? colors.lime : colors.soft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Feather name={row.done ? 'check' : row.icon} size={13} color={colors.ink} />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: row.done ? colors.ink : colors.mute,
                    flex: 1,
                  }}
                >
                  {row.label}
                </Text>
                {row.done && (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.ink, letterSpacing: 0.4 }}>
                    UNLOCKED
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>

        {sales === 0 && (
          <View style={{ marginTop: 14, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 12, color: colors.mute, lineHeight: 18 }}>
              No sales yet — ratings show up after your first completed transaction.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
