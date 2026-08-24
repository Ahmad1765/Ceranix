import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors, type as typography } from '@/lib/theme';
import { BRAND } from '@/lib/brand';
import { dayLabel } from './format';

export function DateDivider({ iso }: { iso: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 6 }}>
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 11,
          letterSpacing: 0.4,
          color: colors.muteSoft,
        }}
      >
        {dayLabel(iso)}
      </Text>
    </View>
  );
}

export function SafetyNote({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          backgroundColor: '#E6F5F6',
          borderRadius: 8,
          padding: 12,
          gap: 10,
        }}
      >
        <Feather name="info" size={16} color="#007782" style={{ marginTop: 1 }} />
        <Text
          style={{
            flex: 1,
            fontFamily: typography.family.sans,
            fontSize: 12.5,
            lineHeight: 17,
            color: '#1F2937',
          }}
        >
          Sharing personal details or following links is dangerous. You aren&apos;t protected if you leave {BRAND}.{' '}
          <Text
            onPress={onPress}
            style={{
              fontFamily: typography.family.sansSemibold,
              color: '#007782',
              textDecorationLine: 'underline',
            }}
          >
            See safety tips
          </Text>
        </Text>
      </View>
    </View>
  );
}

export function SellerIntroBubble({
  name,
  location,
  lastSeen,
  rating,
}: {
  name: string;
  location?: string | null;
  lastSeen?: string | null;
  rating?: string | null;
}) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 8, alignItems: 'flex-start' }}>
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          padding: 14,
          minWidth: 220,
          maxWidth: '85%',
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 14,
            fontWeight: '700',
            color: '#111111',
            marginBottom: 6,
          }}
        >
          Hi, I&apos;m {name}
        </Text>
        {rating ? (
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 12.5,
              color: '#6B7280',
              marginBottom: 4,
            }}
          >
            {rating}
          </Text>
        ) : null}
        {location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Feather name="map-pin" size={12} color="#6B7280" style={{ marginRight: 5 }} />
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 12.5,
                color: '#6B7280',
              }}
            >
              {location}
            </Text>
          </View>
        ) : null}
        {lastSeen ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="clock" size={12} color="#6B7280" style={{ marginRight: 5 }} />
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 12.5,
                color: '#6B7280',
              }}
            >
              {lastSeen}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
