import { useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SellForm } from '@/components/sell/SellSheet';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { useGuestGate } from '@/components/GuestGate';
import { useListingQuery } from '@/lib/queries/useListingsQueries';

export default function SellScreen() {
  const { user } = useAuth();
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
    if (!user) {
      guestGate.prompt({
        title: 'Sign in to sell',
        message: 'List your pre-loved fashion in seconds to thousands of buyers.',
        cta: 'Sign in to start selling',
      });
      handleClose();
    }
  }, [user, guestGate, handleClose]);


  if (!user) {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
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

