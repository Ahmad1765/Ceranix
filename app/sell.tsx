import { useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { SellForm } from '@/components/sell/SellSheet';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { useGuestGate } from '@/components/GuestGate';
import { useListingQuery } from '@/lib/queries/useListingsQueries';

export default function SellScreen() {
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const guestGate = useGuestGate();
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = typeof params.id === 'string' ? params.id : undefined;

  const { data: listing } = useListingQuery(listingId);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      guestGate.prompt({
        title: 'Sign in to sell',
        message: 'List your pre-loved fashion in seconds to thousands of buyers.',
        cta: 'Sign in to start selling',
      });
      handleClose();
    }
  }, [authLoading, user, guestGate, handleClose]);

  if (authLoading || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        {authLoading ? <ActivityIndicator color={theme.purple} /> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SellForm
        editingListing={listing ?? null}
        onClose={handleClose}
      />
    </View>
  );
}

