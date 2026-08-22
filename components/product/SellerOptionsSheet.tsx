import React, { useState, useEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator, Share, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { colors } from '@/lib/theme';
import { BRAND, APP_URL } from '@/lib/brand';
import { reportUser, SELLER_REPORT_REASONS } from '@/lib/reports';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { User } from '@/types';

type SellerSummary = {
  id: string;
  username: string;
  avatar_url?: string | null;
  full_name?: string | null;
  location?: string | null;
  is_verified?: boolean;
};

interface SellerOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  seller: SellerSummary | User;
  listingId?: string | null;
}

export function SellerOptionsSheet({
  visible,
  onClose,
  seller,
  listingId,
}: SellerOptionsSheetProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'options' | 'report'>('options');
  const [submittingReport, setSubmittingReport] = useState(false);
  const isSubmittingReportRef = useRef(false);

  // Reset mode on reopen
  useEffect(() => {
    if (visible) {
      setMode('options');
      setSubmittingReport(false);
      isSubmittingReportRef.current = false;
    }
  }, [visible]);

  if (!seller) return null;

  const sellerUrl = `${APP_URL}/user/${seller.id}`;

  const handleShare = async () => {
    onClose();
    try {
      if (Platform.OS === 'web') {
        if (navigator?.share) {
          try {
            await navigator.share({
              title: `@${seller.username} on ${BRAND}`,
              text: `Check out @${seller.username}'s shop on ${BRAND}!`,
              url: sellerUrl,
            });
            return;
          } catch {
            // fallback to clipboard
          }
        }
        await Clipboard.setStringAsync(sellerUrl);
        toast.show('Profile link copied to clipboard!', { variant: 'success', icon: 'copy' });
      } else {
        await Share.share({
          message: `Check out @${seller.username}'s shop on ${BRAND}!\n${sellerUrl}`,
          url: sellerUrl,
        });
      }
    } catch {
      // User cancelled
    }
  };

  const handleViewProfile = () => {
    onClose();
    router.push(`/user/${seller.id}` as any);
  };

  const handleSelectReportReason = async (reasonId: string) => {
    if (isSubmittingReportRef.current) return;

    if (!user) {
      onClose();
      toast.show('Sign in to report a seller', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }

    if (user.id === seller.id) {
      onClose();
      toast.show("You can't report your own profile", { variant: 'default', icon: 'info' });
      return;
    }

    isSubmittingReportRef.current = true;
    setSubmittingReport(true);
    try {
      const ok = await reportUser({
        reporterId: user.id,
        reportedUserId: seller.id,
        reason: reasonId,
        listingId: listingId ?? null,
      });
      onClose();

      if (ok) {
        toast.show('Thanks — our team will take a look.', { variant: 'success', icon: 'flag' });
      } else {
        toast.show('Could not submit report. Please try again.', { variant: 'default', icon: 'alert-triangle' });
      }
    } finally {
      isSubmittingReportRef.current = false;
      setSubmittingReport(false);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={mode === 'options' ? `@${seller.username}` : 'Report seller'}
      subtitle={mode === 'options' ? (seller.location || 'Seller options') : 'Select a reason for review'}
      autoHeight={true}
    >
      {mode === 'options' ? (
        <View style={styles.container}>
          {/* Grouped Actions Card */}
          <View style={styles.actionGroup}>
            {/* Share profile */}
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.purpleSoft }]}>
                <Feather name="share-2" size={17} color={colors.purple} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Share seller profile</Text>
                <Text style={styles.actionDesc}>Copy link or share to other apps</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mute} />
            </Pressable>

            <View style={styles.divider} />

            {/* View shop */}
            <Pressable
              onPress={handleViewProfile}
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(15,15,15,0.06)' }]}>
                <Feather name="shopping-bag" size={17} color={colors.ink} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>View full shop & listings</Text>
                <Text style={styles.actionDesc}>Browse reviews, ratings, and items</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mute} />
            </Pressable>

            <View style={styles.divider} />

            {/* Report */}
            <Pressable
              onPress={() => setMode('report')}
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                <Feather name="flag" size={17} color="#EF4444" />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, { color: '#EF4444' }]}>Report seller</Text>
                <Text style={styles.actionDesc}>Flag suspicious activity or violations</Text>
              </View>
              <Feather name="chevron-right" size={17} color="#EF4444" />
            </Pressable>
          </View>
        </View>
      ) : (
        /* Reporting mode */
        <View style={styles.container}>
          {submittingReport ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.purple} />
              <Text style={styles.loadingText}>Submitting report...</Text>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => setMode('options')}
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
              >
                <Feather name="arrow-left" size={15} color={colors.ink} />
                <Text style={styles.backBtnText}>Back to options</Text>
              </Pressable>

              <View style={styles.reportGroup}>
                {SELLER_REPORT_REASONS.map((r, idx) => (
                  <React.Fragment key={r.id}>
                    <Pressable
                      onPress={() => handleSelectReportReason(r.id)}
                      style={({ pressed }) => [
                        styles.reportReasonRow,
                        pressed && styles.actionRowPressed,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportReasonLabel}>{r.label}</Text>
                        {r.description ? (
                          <Text style={styles.reportReasonDesc}>{r.description}</Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.mute} />
                    </Pressable>
                    {idx < SELLER_REPORT_REASONS.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 2,
  },
  actionGroup: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  actionRowPressed: {
    backgroundColor: 'rgba(15,15,15,0.07)',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  actionDesc: {
    fontSize: 12,
    color: colors.mute,
    marginTop: 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(15,15,15,0.06)',
    marginLeft: 64,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  reportGroup: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    overflow: 'hidden',
  },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  reportReasonLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.ink,
  },
  reportReasonDesc: {
    fontSize: 11.5,
    color: colors.mute,
    marginTop: 1,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13.5,
    color: colors.mute,
    fontWeight: '600',
  },
});
