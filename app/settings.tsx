// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Decoupling App Preferences & Account Domain Lifecycles
//
// 1. Separation of Responsibilities:
//    SettingsScreen acts as the layout coordinator. All stateful domain logic
//    (payout methods, addresses, identity checks, vacation mode, analytics opt-out,
//    push registration, password reset, and deletion flows) is encapsulated in
//    `useSettingsManager`.
//
// 2. Deep-Link Support:
//    Direct navigation paths (e.g. `?open=bundle` or `?open=account`) automatically
//    expand the relevant section or modal sheet upon arrival.
// ─────────────────────────────────────────────────────────────────────────────

import { View, Pressable, ScrollView, Platform, ActivityIndicator, Linking } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth';
import { safeBack } from '@/lib/nav';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';
import {
  SectionCard,
  Row,
  ToggleRow,
  Divider,
  SettingsHero,
  SheetLabel,
  BundleDiscountSheet,
  AddressSheet,
  PayoutSheet,
  VerificationSheet,
  ThemeSheet,
  SubscriptionSheet,
  useSettingsManager,
  SUPPORT_EMAIL,
  TERMS_URL,
  PRIVACY_URL,
} from '@/components/settings';

export default function SettingsScreen() {
  const { profile, user, session } = useAuth();
  const { theme, mode, isDark, setThemeMode } = useTheme();

  const mgr = useSettingsManager();

  const vacationOn = !!profile?.vacation_mode;
  const bundlePct = profile?.bundle_discount_pct ?? 0;
  const bundleOn = bundlePct > 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 14,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Feather name="arrow-left" size={18} color={theme.text} />
        </Pressable>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: theme.text,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          Settings
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}
      >
        {/* Profile / Account Hero */}
        <SettingsHero
          profile={profile}
          hasSession={!!session}
          onEditProfile={() => {
            tap('light');
            router.push('/profile/edit');
          }}
          onSignIn={() => router.push('/auth/login')}
        />

        {/* 1. Purchases & Sales Accordion */}
        <SectionCard
          icon="shopping-bag"
          title="Purchases & Sales"
          subtitle="My shop, promotions & discounts"
          expanded={mgr.open === 'shop'}
          onToggle={() => mgr.toggleSection('shop')}
        >
          <Row
            label="Order history"
            desc="Your orders, invoices & payouts"
            onPress={() => router.push('/orders' as any)}
            chevron
          />
          <Divider />
          <Row
            label="Bundle discount"
            desc={bundleOn ? `Active · ${bundlePct}% off bundles` : 'Tap to set a bundle discount'}
            onPress={() => {
              tap('light');
              mgr.setShowBundle(true);
            }}
            chevron
            badge={bundleOn ? `${bundlePct}%` : undefined}
          />
          <Divider />
          <ToggleRow
            label="Vacation mode"
            desc={
              vacationOn
                ? 'Your listings are hidden from the feed'
                : "Pause your listings while you're away"
            }
            value={vacationOn}
            onValueChange={mgr.setVacationMode}
            disabled={!user?.id}
          />
          <Divider />
          <Row
            label="Share your profile"
            desc={profile?.username ? `@${profile.username}` : 'Send a link to your shop'}
            onPress={() => {
              if (profile?.id) router.push(`/user/${profile.id}` as any);
            }}
            chevron
            disabled={!profile?.id}
          />
        </SectionCard>

        {/* 2. Verification, Payouts & Shipping Accordion */}
        <SectionCard
          icon="shield"
          title="Verification, payouts & shipping"
          subtitle="Settings for purchases & sales"
          expanded={mgr.open === 'verify'}
          onToggle={() => mgr.toggleSection('verify')}
        >
          <Row
            label="Identity verification"
            desc={
              mgr.loadingExtras
                ? 'Loading…'
                : mgr.verification
                  ? `Status: ${mgr.verification.status}`
                  : 'Not submitted'
            }
            onPress={() => {
              tap('light');
              mgr.setShowVerify(true);
            }}
            chevron
            badge={
              mgr.verification?.status === 'approved'
                ? 'Verified'
                : mgr.verification?.status === 'submitted'
                  ? 'Pending'
                  : undefined
            }
          />
          <Divider />
          <Row
            label="Payout method"
            desc={
              mgr.loadingExtras
                ? 'Loading…'
                : mgr.payout
                  ? `${mgr.payout.kind === 'bank' ? 'Bank' : 'Wallet'} · ${mgr.payout.label} ••${mgr.payout.account_last4}`
                  : 'Add a bank or wallet'
            }
            onPress={() => {
              tap('light');
              mgr.setShowPayout(true);
            }}
            chevron
          />
          <Divider />
          <Row
            label="Shipping address"
            desc={
              mgr.loadingExtras
                ? 'Loading…'
                : mgr.address
                  ? `${mgr.address.line1}, ${mgr.address.city}`
                  : 'Where do we ship from?'
            }
            onPress={() => {
              tap('light');
              mgr.setShowAddress(true);
            }}
            chevron
          />
        </SectionCard>

        {/* 3. Enhance Experience & Personalization Accordion */}
        <SectionCard
          icon="sliders"
          title="Enhance the experience"
          subtitle="Personalization, badges & subscriptions"
          expanded={mgr.open === 'enhance'}
          onToggle={() => mgr.toggleSection('enhance')}
        >
          {Platform.OS !== 'web' && (
            <>
              <ToggleRow
                label="Push notifications"
                desc="Messages, offers & sales on this device"
                value={mgr.pushOn}
                onValueChange={mgr.handlePushToggle}
                disabled={!session}
              />
              <Divider />
            </>
          )}
          <Row
            label="Notifications"
            desc="Push, email & in-app"
            onPress={mgr.openSystemSettings}
            chevron
          />
          <Divider />
          <ToggleRow
            label="Dark mode"
            desc={isDark ? 'Dark monotone appearance active' : 'Light monotone appearance active'}
            value={isDark}
            onValueChange={(val) => {
              setThemeMode(val ? 'dark' : 'light');
            }}
          />
          <Divider />
          <Row
            label="Theme & Appearance"
            desc={`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} (${isDark ? 'Dark monotone' : 'Light monotone'})`}
            onPress={() => {
              tap('light');
              mgr.setShowTheme(true);
            }}
            chevron
          />
          <Divider />
          <Row
            label="Seller Program & Subscriptions"
            desc={profile?.is_pro ? 'Pro Seller Program · Active' : 'Upgrade to Pro Seller Program'}
            onPress={() => {
              tap('light');
              mgr.setShowSubscription(true);
            }}
            chevron
            badge={profile?.is_pro ? 'PRO' : 'FREE'}
          />
        </SectionCard>

        {/* 4. Manage Account Accordion */}
        <SectionCard
          icon="user"
          title="Manage account"
          subtitle="Email, password & deletion"
          expanded={mgr.open === 'account'}
          onToggle={() => mgr.toggleSection('account')}
        >
          {user?.email && (
            <>
              <View style={{ paddingVertical: 14 }}>
                <SheetLabel>Email</SheetLabel>
                <Text
                  style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 4 }}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              </View>
              <Divider />
            </>
          )}
          <Row
            label="Change password"
            desc={mgr.busy === 'password' ? 'Sending email…' : 'Send a reset link via email'}
            onPress={mgr.handleResetPassword}
            chevron
            disabled={mgr.busy === 'password' || !user?.email}
            loading={mgr.busy === 'password'}
          />
          <Divider />
          <Row
            label="Delete account"
            desc="Permanently remove your data"
            onPress={mgr.handleDeleteAccount}
            destructive
            disabled={mgr.busy === 'delete'}
            loading={mgr.busy === 'delete'}
          />
        </SectionCard>

        {/* 5. Help Center Accordion */}
        <SectionCard
          icon="help-circle"
          title="Help center"
          subtitle="Support & guides"
          expanded={mgr.open === 'help'}
          onToggle={() => mgr.toggleSection('help')}
        >
          <Row
            label="Contact support"
            desc={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
            chevron
          />
          <Divider />
          <Row
            label="Terms of service"
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            chevron
          />
          <Divider />
          <Row
            label="Privacy policy"
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            chevron
          />
          <Divider />
          <ToggleRow
            label="Share usage data"
            desc="Helps us improve the app. No personal content is collected."
            value={mgr.shareUsage}
            onValueChange={mgr.setShareUsage}
          />
        </SectionCard>

        {/* Log out Button */}
        {session && (
          <Pressable
            onPress={mgr.handleLogout}
            disabled={mgr.busy === 'logout'}
            accessibilityRole="button"
            accessibilityState={{ busy: mgr.busy === 'logout' }}
            style={({ pressed }) => ({
              height: 58,
              borderRadius: 16,
              backgroundColor: theme.accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
              overflow: 'hidden',
              opacity: mgr.busy === 'logout' ? 0.7 : 1,
              transform: [{ scale: pressed && mgr.busy !== 'logout' ? 0.985 : 1 }],
            })}
          >
            <View
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 58,
                backgroundColor: theme.accent === '#FFFFFF' ? '#EEEEEE' : theme.text,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mgr.busy === 'logout' ? (
                <ActivityIndicator color={theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF'} />
              ) : (
                <Feather
                  name="log-out"
                  size={18}
                  color={theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF'}
                />
              )}
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF',
                marginRight: 58,
              }}
            >
              {mgr.busy === 'logout' ? 'Signing out…' : 'Log out'}
            </Text>
          </Pressable>
        )}

        <Text
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: theme.textMuted,
            marginTop: 18,
            fontWeight: '600',
            letterSpacing: 0.4,
          }}
        >
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
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

      <ThemeSheet
        visible={mgr.showTheme}
        onClose={() => mgr.setShowTheme(false)}
      />

      <SubscriptionSheet
        visible={mgr.showSubscription}
        onClose={() => mgr.setShowSubscription(false)}
      />
    </SafeAreaView>
  );
}
