// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS SCREEN (CHATGPT-INSPIRED CLEAN & LAPTOP-FRIENDLY ARCHITECTURE)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 Architectural Blueprint:
// 1. Laptop/Desktop View (>= 768px):
//    Two-column centered dialog matching ChatGPT web settings:
//    - Left Sidebar (230px): Tab navigation with icons, active highlight, and profile summary.
//    - Right Content Panel: Active tab header with close (X) button, and clean high-density rows.
//
// 2. Mobile View (< 768px):
//    Full-screen responsive layout with universal 30px category pill tabs and clean rows.
//
// 3. Domain Logic:
//    Decoupled via `useSettingsManager` for address CRUD, payouts, verification,
//    vacation mode, bundle discounts, push notifications, and auth flows.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { safeBack } from '@/lib/nav';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { bp } from '@/lib/responsive';
import {
  BundleDiscountSheet,
  AddressSheet,
  PayoutSheet,
  VerificationSheet,
  ThemeSheet,
  SubscriptionSheet,
  useSettingsManager,
  TERMS_URL,
  PRIVACY_URL,
  SUPPORT_EMAIL,
  ChatGPTRow,
  ChatGPTButton,
  ChatGPTSwitchRow,
  ChatGPTTabItem,
  type Section,
} from '@/components/settings';

interface TabConfig {
  key: Section;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  badge?: string;
}

const TABS: TabConfig[] = [
  { key: 'general', label: 'General', icon: 'sliders' },
  { key: 'account', label: 'Account', icon: 'user' },
  { key: 'shop', label: 'Purchases & Sales', icon: 'shopping-bag' },
  { key: 'verify', label: 'Verification & Payouts', icon: 'shield' },
  { key: 'security', label: 'Security', icon: 'lock' },
  { key: 'help', label: 'Help & Legal', icon: 'help-circle' },
];

export default function SettingsScreen() {
  const { profile, user, session } = useAuth();
  const { theme, mode, isDark, setThemeMode } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLaptop = width >= bp.lg;

  const mgr = useSettingsManager();

  // ponytail: normalize enhance -> general for backward compatibility with deep links
  const activeTab: Section =
    mgr.open === 'enhance' ? 'general' : (mgr.open ?? 'general');

  // ponytail: admin hub is off-platform (/admin) and removed from consumer user profiles
  const visibleTabs = TABS;
  const currentTab = visibleTabs.find((t) => t.key === activeTab) ?? visibleTabs[0];

  const vacationOn = !!profile?.vacation_mode;
  const bundlePct = profile?.bundle_discount_pct ?? 0;
  const bundleOn = bundlePct > 0;

  const initial =
    ((profile?.full_name || profile?.username || 'U').trim().charAt(0) || 'U').toUpperCase();

  // ── Render Active Tab Rows ────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <>
            <ChatGPTRow
              label="Theme"
              desc={`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} (${isDark ? 'Dark' : 'Light'})`}
            >
              <ChatGPTButton
                label="Change"
                icon="chevron-down"
                onPress={() => {
                  tap('light');
                  mgr.setShowTheme(true);
                }}
              />
            </ChatGPTRow>

            <ChatGPTSwitchRow
              label="Dark mode"
              desc={isDark ? 'Dark appearance active' : 'Light appearance active'}
              value={isDark}
              onValueChange={(val) => {
                setThemeMode(val ? 'dark' : 'light');
              }}
            />

            {Platform.OS !== 'web' && (
              <ChatGPTSwitchRow
                label="Push notifications"
                desc="Receive alerts for offers, orders, and messages on this device"
                value={mgr.pushOn}
                onValueChange={mgr.handlePushToggle}
                disabled={!session}
              />
            )}

            <ChatGPTRow
              label="System notification settings"
              desc="Open system preferences to manage notification alerts"
            >
              <ChatGPTButton
                label="Manage"
                onPress={() => {
                  tap('light');
                  mgr.openSystemSettings();
                }}
              />
            </ChatGPTRow>

            <ChatGPTSwitchRow
              label="Share usage data"
              desc="Help us improve Carrinex with anonymous diagnostic telemetry. No personal content is collected."
              value={mgr.shareUsage}
              onValueChange={mgr.setShareUsage}
            />

            <ChatGPTRow
              label="Version"
              desc={`v${Constants.expoConfig?.version ?? '1.0.0'} (${Platform.OS})`}
            >
              <ChatGPTButton label="Up to date" variant="ghost" disabled />
            </ChatGPTRow>
          </>
        );

      case 'account':
        return (
          <>
            {profile ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: isDark ? theme.panel : 'rgba(0,0,0,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    marginRight: 14,
                  }}
                >
                  {profile.avatar_url ? (
                    <Image
                      source={{ uri: getOptimizedImageUrl(profile.avatar_url, { width: 96 }) }}
                      style={{ width: 48, height: 48 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={IMAGE_TRANSITION}
                    />
                  ) : (
                    <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>
                      {initial}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: '700', color: theme.text }}
                      numberOfLines={1}
                    >
                      {profile.full_name || profile.username}
                    </Text>
                    {profile.is_verified && (
                      <View style={{ marginLeft: 6 }}>
                        <ShieldCheckIcon size={16} />
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                    @{profile.username}
                  </Text>
                </View>
                <ChatGPTButton
                  label="Edit profile"
                  icon="edit-2"
                  onPress={() => {
                    tap('light');
                    router.push('/profile/edit');
                  }}
                />
              </View>
            ) : (
              <ChatGPTRow
                label="Sign in"
                desc="Access your profile, saved listings, and shop preferences"
              >
                <ChatGPTButton
                  label="Sign in"
                  icon="log-in"
                  onPress={() => router.push('/auth/login')}
                />
              </ChatGPTRow>
            )}

            {user?.email && (
              <ChatGPTRow label="Email address" desc={user.email}>
                <ChatGPTButton label="Primary" variant="ghost" disabled />
              </ChatGPTRow>
            )}

            <ChatGPTRow
              label="Seller Membership"
              desc={profile?.is_pro ? 'Pro Seller Program · Active' : 'Standard marketplace account'}
            >
              <ChatGPTButton
                label={profile?.is_pro ? 'Manage Pro' : 'Upgrade'}
                onPress={() => {
                  tap('light');
                  mgr.setShowSubscription(true);
                }}
              />
            </ChatGPTRow>

            <ChatGPTSwitchRow
              label="Public saved collection"
              desc={
                mgr.savedCollectionPrivacy === 'public'
                  ? 'Public — other members can view your curated collections on your profile'
                  : 'Private — only you can view your saved items'
              }
              value={mgr.savedCollectionPrivacy === 'public'}
              onValueChange={(val) => {
                mgr.setSavedCollectionPrivacy(val ? 'public' : 'private');
              }}
            />

            <ChatGPTRow
              label="Find & invite friends"
              desc="Search members or share your invite link"
            >
              <ChatGPTButton
                label="Find members"
                icon="user-plus"
                onPress={() => {
                  tap('light');
                  router.push('/friends' as any);
                }}
              />
            </ChatGPTRow>

            {session && (
              <ChatGPTRow
                label="Sign out"
                desc="Sign out of your account on this device"
              >
                <ChatGPTButton
                  label={mgr.busy === 'logout' ? 'Signing out…' : 'Log out'}
                  icon="log-out"
                  loading={mgr.busy === 'logout'}
                  disabled={mgr.busy === 'logout'}
                  onPress={mgr.handleLogout}
                />
              </ChatGPTRow>
            )}
          </>
        );

      case 'shop':
        return (
          <>
            <ChatGPTRow
              label="Orders & invoices"
              desc="View your purchases, buyer invoices, and seller order records"
            >
              <ChatGPTButton
                label="View orders"
                icon="external-link"
                onPress={() =>
                  router.push({ pathname: '/(tabs)/chat', params: { tab: 'orders' } } as any)
                }
              />
            </ChatGPTRow>

            <ChatGPTRow
              label="Bundle discount"
              desc={
                bundleOn
                  ? `Active · ${bundlePct}% off orders containing 2 or more items`
                  : 'Offer automatic tiered discounts when buyers bundle items from your shop'
              }
            >
              <ChatGPTButton
                label={bundleOn ? `${bundlePct}% Off` : 'Configure'}
                onPress={() => {
                  tap('light');
                  mgr.setShowBundle(true);
                }}
              />
            </ChatGPTRow>

            <ChatGPTSwitchRow
              label="Vacation mode"
              desc={
                vacationOn
                  ? 'Your shop listings are temporarily hidden from the marketplace feed'
                  : "Pause your listings while you're away without removing inventory"
              }
              value={vacationOn}
              onValueChange={mgr.setVacationMode}
              disabled={!user?.id}
            />

            <ChatGPTRow
              label="Public shop link"
              desc={profile?.username ? `@${profile.username}` : 'Share a direct link to your shop'}
            >
              <ChatGPTButton
                label="Share shop"
                icon="share-2"
                disabled={!profile?.id}
                onPress={() => {
                  if (profile?.id) router.push(`/user/${profile.id}` as any);
                }}
              />
            </ChatGPTRow>
          </>
        );

      case 'verify':
        return (
          <>
            <ChatGPTRow
              label="Identity verification"
              desc={
                mgr.loadingExtras
                  ? 'Loading status…'
                  : mgr.verification?.status === 'approved'
                    ? 'Verified seller account'
                    : mgr.verification?.status === 'submitted'
                      ? 'Identity verification submitted and pending review'
                      : 'Verify your government ID for trusted buyer/seller protection'
              }
            >
              {mgr.verification?.status === 'approved' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ShieldCheckIcon size={16} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
                    Verified
                  </Text>
                </View>
              ) : (
                <ChatGPTButton
                  label={mgr.verification?.status === 'submitted' ? 'Pending' : 'Verify ID'}
                  icon="shield"
                  onPress={() => {
                    tap('light');
                    mgr.setShowVerify(true);
                  }}
                />
              )}
            </ChatGPTRow>

            <ChatGPTRow
              label="Payout method"
              desc={
                mgr.loadingExtras
                  ? 'Loading…'
                  : mgr.payout
                    ? `${mgr.payout.kind === 'bank' ? 'Bank' : 'Wallet'} · ${mgr.payout.label} ••${mgr.payout.account_last4}`
                    : 'Add a bank account or wallet for automatic sales disbursements'
              }
            >
              <ChatGPTButton
                label={mgr.payout ? 'Manage' : 'Add payout'}
                onPress={() => {
                  tap('light');
                  mgr.setShowPayout(true);
                }}
              />
            </ChatGPTRow>

            <ChatGPTRow
              label="Shipping address"
              desc={
                mgr.loadingExtras
                  ? 'Loading…'
                  : mgr.address
                    ? `${mgr.address.line1}, ${mgr.address.city}`
                    : 'Dispatch and return address used on generated shipping labels'
              }
            >
              <ChatGPTButton
                label={mgr.address ? 'Edit address' : 'Add address'}
                onPress={() => {
                  tap('light');
                  mgr.setShowAddress(true);
                }}
              />
            </ChatGPTRow>
          </>
        );

      case 'security':
        return (
          <>
            <ChatGPTRow
              label="Password"
              desc={
                mgr.busy === 'password'
                  ? 'Sending reset link…'
                  : 'Send a secure password reset link to your email'
              }
            >
              <ChatGPTButton
                label={mgr.busy === 'password' ? 'Sending…' : 'Reset password'}
                loading={mgr.busy === 'password'}
                disabled={mgr.busy === 'password' || !user?.email}
                onPress={mgr.handleResetPassword}
              />
            </ChatGPTRow>

            <ChatGPTRow
              label="Delete account"
              desc="Permanently delete your account and remove all personal information and listings. This cannot be undone."
              destructive
            >
              <ChatGPTButton
                label={mgr.busy === 'delete' ? 'Deleting…' : 'Delete account'}
                destructive
                loading={mgr.busy === 'delete'}
                disabled={mgr.busy === 'delete'}
                onPress={mgr.handleDeleteAccount}
              />
            </ChatGPTRow>
          </>
        );

      case 'help':
        return (
          <>
            <ChatGPTRow
              label="Customer Support"
              desc={session ? 'Chat live with 24/7 Ceranix Concierge' : SUPPORT_EMAIL}
            >
              <ChatGPTButton
                label="Contact"
                icon="message-square"
                onPress={() => {
                  if (session) {
                    router.push('/conversation/new?support=true' as any);
                  } else {
                    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
                  }
                }}
              />
            </ChatGPTRow>

            <ChatGPTRow
              label="Terms of service"
              desc="Marketplace rules, policies, and community guidelines"
            >
              <ChatGPTButton
                label="View terms"
                icon="external-link"
                onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
              />
            </ChatGPTRow>

            <ChatGPTRow
              label="Privacy policy"
              desc="Data governance, cookies, and privacy rights"
            >
              <ChatGPTButton
                label="View policy"
                icon="external-link"
                onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
              />
            </ChatGPTRow>

            <ChatGPTRow
              label="Application version"
              desc={`Release ${Constants.expoConfig?.version ?? '1.0.0'}`}
            >
              <ChatGPTButton label="Up to date" variant="ghost" disabled />
            </ChatGPTRow>
          </>
        );

      default:
        return null;
    }
  };

  // ── 1. Laptop / Desktop Two-Column Layout ─────────────────────────────────
  if (isLaptop) {
    const dialogWidth = Math.min(880, width - 48);
    const dialogHeight = Math.min(620, Math.max(500, height - 72));

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: isDark ? '#141414' : '#F5F5F7',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        {/* ChatGPT Centered Settings Dialog */}
        <View
          style={{
            width: dialogWidth,
            height: dialogHeight,
            backgroundColor: theme.panel,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            flexDirection: 'row',
            overflow: 'hidden',
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          {/* Left Navigation Sidebar */}
          <View
            style={{
              width: 230,
              borderRightWidth: 1,
              borderRightColor: theme.border,
              backgroundColor: isDark ? '#1A1A1A' : '#FAFAFA',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: theme.text,
                  letterSpacing: -0.2,
                }}
              >
                Settings
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}
              style={{ flex: 1 }}
            >
              {visibleTabs.map((tab) => (
                <ChatGPTTabItem
                  key={tab.key}
                  icon={tab.icon}
                  label={tab.label}
                  active={activeTab === tab.key}
                  badge={tab.badge}
                  onPress={() => mgr.toggleSection(tab.key)}
                />
              ))}
            </ScrollView>

            {/* Bottom Profile / Account Snippet */}
            <View
              style={{
                padding: 12,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                backgroundColor: isDark ? '#1A1A1A' : '#FAFAFA',
              }}
            >
              {profile ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isDark ? theme.panel : 'rgba(0,0,0,0.06)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      marginRight: 10,
                    }}
                  >
                    {profile.avatar_url ? (
                      <Image
                        source={{ uri: getOptimizedImageUrl(profile.avatar_url, { width: 64 }) }}
                        style={{ width: 32, height: 32 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>
                        {initial}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text
                      style={{ fontSize: 12, fontWeight: '700', color: theme.text }}
                      numberOfLines={1}
                    >
                      {profile.full_name || profile.username}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                      @{profile.username}
                    </Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => router.push('/auth/login')}
                  style={({ pressed }) => ({
                    paddingVertical: 6,
                    alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>
                    Sign in to Carrinex
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Right Content Panel */}
          <View style={{ flex: 1, backgroundColor: theme.panel, display: 'flex' }}>
            {/* Header with Title and Close (X) */}
            <View
              style={{
                height: 56,
                paddingHorizontal: 24,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>
                {currentTab.label}
              </Text>
              <Pressable
                onPress={() => safeBack()}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                hitSlop={8}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed
                    ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                    : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                })}
              >
                <Feather name="x" size={16} color={theme.text} />
              </Pressable>
            </View>

            {/* Scrollable Settings Rows */}
            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingVertical: 10,
                paddingBottom: 32,
              }}
              style={{ flex: 1 }}
            >
              {renderTabContent()}
            </ScrollView>
          </View>
        </View>

        {/* Modal Sheets */}
        <BundleDiscountSheet
          visible={mgr.showBundle}
          currentPct={bundlePct}
          onClose={() => mgr.setShowBundle(false)}
          onSave={async (pct) => {
            await mgr.setBundlePct(pct);
            mgr.setShowBundle(false);
          }}
        />

        <AddressSheet
          visible={mgr.showAddress}
          initial={mgr.address}
          onClose={() => mgr.setShowAddress(false)}
          onSave={async (form) => {
            const ok = await mgr.saveAddress(form);
            if (ok) mgr.setShowAddress(false);
          }}
          onRemove={
            mgr.address?.id
              ? async () => {
                  await mgr.removeAddress();
                  mgr.setShowAddress(false);
                }
              : undefined
          }
        />

        <PayoutSheet
          visible={mgr.showPayout}
          initial={mgr.payout}
          onClose={() => mgr.setShowPayout(false)}
          onSave={async (form) => {
            const ok = await mgr.savePayout(form);
            if (ok) mgr.setShowPayout(false);
          }}
          onRemove={
            mgr.payout?.id
              ? async () => {
                  await mgr.removePayout();
                  mgr.setShowPayout(false);
                }
              : undefined
          }
        />

        <VerificationSheet
          visible={mgr.showVerify}
          initial={mgr.verification}
          onClose={() => mgr.setShowVerify(false)}
          onSave={async (form) => {
            const ok = await mgr.saveVerification(form);
            if (ok) mgr.setShowVerify(false);
          }}
        />

        <ThemeSheet visible={mgr.showTheme} onClose={() => mgr.setShowTheme(false)} />

        <SubscriptionSheet
          visible={mgr.showSubscription}
          onClose={() => mgr.setShowSubscription(false)}
        />
      </View>
    );
  }

  // ── 2. Mobile Responsive Layout ───────────────────────────────────────────
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Header */}
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          <Pressable
            onPress={() => safeBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="arrow-left" size={17} color={theme.text} />
          </Pressable>

          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: theme.text,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Settings
          </Text>

          <View style={{ width: 36 }} />
        </View>

        {/* Universal 30px Category Pills Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  tap('light');
                  mgr.toggleSection(tab.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => ({
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isActive ? theme.ink : theme.panel,
                  borderWidth: isActive ? 0 : 1,
                  borderColor: theme.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Feather
                  name={tab.icon}
                  size={13}
                  color={isActive ? theme.background : theme.text}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? '700' : '600',
                    color: isActive ? theme.background : theme.text,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Mobile Content ScrollView */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 48,
        }}
      >
        {renderTabContent()}
      </ScrollView>

      {/* Modal Sheets */}
      <BundleDiscountSheet
        visible={mgr.showBundle}
        currentPct={bundlePct}
        onClose={() => mgr.setShowBundle(false)}
        onSave={async (pct) => {
          await mgr.setBundlePct(pct);
          mgr.setShowBundle(false);
        }}
      />

      <AddressSheet
        visible={mgr.showAddress}
        initial={mgr.address}
        onClose={() => mgr.setShowAddress(false)}
        onSave={async (form) => {
          const ok = await mgr.saveAddress(form);
          if (ok) mgr.setShowAddress(false);
        }}
        onRemove={
          mgr.address?.id
            ? async () => {
                await mgr.removeAddress();
                mgr.setShowAddress(false);
              }
            : undefined
        }
      />

      <PayoutSheet
        visible={mgr.showPayout}
        initial={mgr.payout}
        onClose={() => mgr.setShowPayout(false)}
        onSave={async (form) => {
          const ok = await mgr.savePayout(form);
          if (ok) mgr.setShowPayout(false);
        }}
        onRemove={
          mgr.payout?.id
            ? async () => {
                await mgr.removePayout();
                mgr.setShowPayout(false);
              }
            : undefined
        }
      />

      <VerificationSheet
        visible={mgr.showVerify}
        initial={mgr.verification}
        onClose={() => mgr.setShowVerify(false)}
        onSave={async (form) => {
          const ok = await mgr.saveVerification(form);
          if (ok) mgr.setShowVerify(false);
        }}
      />

      <ThemeSheet visible={mgr.showTheme} onClose={() => mgr.setShowTheme(false)} />

      <SubscriptionSheet
        visible={mgr.showSubscription}
        onClose={() => mgr.setShowSubscription(false)}
      />
    </SafeAreaView>
  );
}
