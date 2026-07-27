import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useSellSheet } from '@/components/sell/SellSheet';

// The Sell tab no longer renders here — it opens the sell form as a Modal
// (see components/sell/SellSheet.tsx) over whatever screen is active, the
// same way the product page's "Offer" button opens OfferSheet. The
// AnimatedTabBar intercepts the tab's tabPress and calls useSellSheet().open()
// directly, but this route must still exist for `Tabs.Screen name="upload"`
// to register. Anything that reaches this file directly (a raw deep link,
// back/forward, programmatic navigation.navigate('upload')) opens the same
// sheet here and bounces back to a real tab.
export default function UploadTabFallback() {
  const { session, loading } = useAuth();
  const { open } = useSellSheet();

  useEffect(() => {
    if (loading || !session) return;
    open();
  }, [loading, session, open]);

  if (loading) return null;
  return <Redirect href={session ? '/(tabs)' : '/auth/login'} />;
}
