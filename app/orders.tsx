import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

/**
 * /orders route redirector.
 * Inbox Orders (/(tabs)/chat?tab=orders) is now the single consolidated orders dashboard.
 */
export default function OrdersRedirect() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)/chat',
      params: {
        tab: 'orders',
        ...params,
      },
    } as any);
  }, [params]);

  return <View style={{ flex: 1, backgroundColor: theme.background }} />;
}
