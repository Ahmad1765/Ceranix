import { View, ActivityIndicator } from 'react-native';
import { Slot, Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';

export default function AdminLayout() {
  const { user, profile, loading } = useAuth();
  const { theme } = useTheme();

  // Show neutral loading indicator while session/profile initializes
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    );
  }

  // Hard barrier: Non-administrators and guests are strictly redirected away
  if (!user || !profile?.is_admin) {
    return <Redirect href="/" />;
  }

  return <Slot />;
}
