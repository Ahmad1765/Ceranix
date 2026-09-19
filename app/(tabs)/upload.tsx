import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';

// The Sell tab opens the sell form as a Modal (see components/sell/SellSheet.tsx)
// over whatever screen is active. The AnimatedTabBar intercepts the tab's
// tabPress and calls useSellSheet().open() directly, but this route still
// registers so deep links and programmatic navigation open the sheet.
export default function UploadTabFallback() {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    router.replace('/sell' as any);
  }, [isFocused]);

  return null;
}

