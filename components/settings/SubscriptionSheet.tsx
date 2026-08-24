import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { SheetModal, SheetLabel, SheetPrimary } from './Sheet';

const PRO_PERKS = [
  {
    icon: 'award' as const,
    title: 'Verified PRO Badge',
    desc: 'Stand out on listings and profile with the official Pro mark',
  },
  {
    icon: 'trending-up' as const,
    title: 'Priority Feed Placement',
    desc: 'Boost your active listings higher in Discover & search results',
  },
  {
    icon: 'percent' as const,
    title: 'Zero Platform Surcharge',
    desc: 'Keep 100% of your earnings minus standard payment processing',
  },
  {
    icon: 'bar-chart-2' as const,
    title: 'Advanced Analytics',
    desc: 'Real-time viewer demographics, search queries & conversion metrics',
  },
  {
    icon: 'zap' as const,
    title: 'Instant Payouts & Unlimited Drafts',
    desc: 'Expedited payout processing and unlimited draft listings',
  },
];

export function SubscriptionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { profile, user, refreshProfile } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const isPro = !!profile?.is_pro;

  const handleTogglePro = async () => {
    if (!user?.id) {
      toast.show('Please sign in to change program', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    tap('medium');
    setLoading(true);
    const nextPro = !isPro;

    try {
      const { data, error } = await supabase.functions.invoke('update-seller-subscription', {
        body: { is_pro: nextPro },
      });

      if (error || data?.error) {
        const errorMsg = error?.message || data?.error || 'Could not update program';
        console.warn('[subscription] Update error:', errorMsg);
        toast.show(errorMsg, {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return;
      }

      toast.show(
        nextPro
          ? 'Welcome to the Pro Seller Program!'
          : 'Switched to Standard Seller Program',
        {
          variant: 'success',
          icon: nextPro ? 'award' : 'check',
        }
      );
      try {
        await refreshProfile();
      } catch (err) {
        console.warn('[subscription] Failed to refresh profile:', err);
      }
      onClose();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not update program', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Seller Program">
      <View style={{ gap: 14, marginTop: 4, marginBottom: 8 }}>
        {/* Status Card */}
        <View
          style={{
            padding: 16,
            borderRadius: 18,
            backgroundColor: isPro ? theme.accent : theme.panel,
            borderWidth: 1.5,
            borderColor: isPro ? theme.accent : theme.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: isPro
                    ? theme.accent === '#FFFFFF'
                      ? '#0F0F0F'
                      : '#FFFFFF'
                    : theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Feather
                  name={isPro ? 'award' : 'user'}
                  size={18}
                  color={
                    isPro
                      ? theme.accent === '#FFFFFF'
                        ? '#FFFFFF'
                        : '#0F0F0F'
                      : theme.text
                  }
                />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '800',
                    color: isPro
                      ? theme.accent === '#FFFFFF'
                        ? '#0F0F0F'
                        : '#FFFFFF'
                      : theme.text,
                    letterSpacing: -0.3,
                  }}
                >
                  {isPro ? 'Pro Seller Program' : 'Standard Member'}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isPro
                      ? theme.accent === '#FFFFFF'
                        ? 'rgba(15,15,15,0.7)'
                        : 'rgba(255,255,255,0.7)'
                      : theme.textMuted,
                    marginTop: 1,
                  }}
                >
                  {isPro ? 'Active · All Pro benefits unlocked' : 'Basic marketplace selling'}
                </Text>
              </View>
            </View>

            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: isPro
                  ? theme.accent === '#FFFFFF'
                    ? '#0F0F0F'
                    : '#FFFFFF'
                  : theme.border,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: isPro
                    ? theme.accent === '#FFFFFF'
                      ? '#FFFFFF'
                      : '#0F0F0F'
                    : theme.textMuted,
                  letterSpacing: 0.5,
                }}
              >
                {isPro ? 'PRO' : 'FREE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Perks list */}
        <View style={{ marginTop: 4 }}>
          <SheetLabel style={{ marginLeft: 4, marginBottom: 8 }}>
            Program Features & Benefits
          </SheetLabel>
          <View style={{ gap: 10 }}>
            {PRO_PERKS.map((perk, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Feather name={perk.icon} size={15} color={theme.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: theme.text,
                      letterSpacing: -0.1,
                    }}
                  >
                    {perk.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.textMuted,
                      marginTop: 2,
                      lineHeight: 15,
                    }}
                  >
                    {perk.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Action Button */}
        <View style={{ marginTop: 8 }}>
          <SheetPrimary
            label={
              loading
                ? 'Updating…'
                : isPro
                ? 'Downgrade to Standard Program'
                : 'Join Pro Seller Program (Free Trial)'
            }
            onPress={handleTogglePro}
            loading={loading}
          />
        </View>
      </View>
    </SheetModal>
  );
}
