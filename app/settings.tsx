import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Platform, Share, Linking, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  ensurePermissionAndRegister,
  isThisDeviceRegistered,
  unregisterThisDevice,
} from '@/lib/notifications';
import { confirm } from '@/lib/confirm';
import { safeBack } from '@/lib/nav';
import { tap } from '@/lib/haptics';
import { colors } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { isOptedOut, setAnalyticsOptOut } from '@/lib/analytics';
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
  type AddressForm,
  type PayoutForm,
  type VerifyForm,
} from '@/components/settings';
import type { PayoutMethod, ShippingAddress, Verification } from '@/types';
import { APP_URL } from '@/lib/brand';

const SUPPORT_EMAIL = 'support@carrinex.app';
const TERMS_URL = `${APP_URL}/terms`;
const PRIVACY_URL = `${APP_URL}/privacy`;

type Section = 'shop' | 'verify' | 'enhance' | 'account' | 'help';
// Runtime mirror of Section, so an `?open=` deep-link param can be validated
// before it's trusted as a section id.
const SECTIONS: readonly Section[] = ['shop', 'verify', 'enhance', 'account', 'help'];
type Busy = 'logout' | 'delete' | 'password' | null;

export default function SettingsScreen() {
  const { profile, user, session, signOut, refreshProfile } = useAuth();
  const { theme, mode, isDark, setThemeMode } = useTheme();
  const toast = useToast();

  const cycleTheme = useCallback(() => {
    tap('light');
    const nextMode = mode === 'system' ? 'dark' : mode === 'dark' ? 'light' : 'system';
    setThemeMode(nextMode);
    toast.show(`Theme: ${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)}`, {
      variant: 'default',
      icon: nextMode === 'dark' ? 'moon' : nextMode === 'light' ? 'sun' : 'monitor',
    });
  }, [mode, setThemeMode, toast]);
  // Deep-link param: profile shop list passes `?open=bundle` so tapping the
  // Bundle row jumps straight into the modal instead of forcing the user to
  // scroll the settings page to find it.
  const params = useLocalSearchParams<{ open?: string }>();

  const [open, setOpen] = useState<Section | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Push toggle. `pushOn` reflects OS permission AND a live user_devices row,
  // so turning it off here really stops the pushes rather than just looking off.
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [shareUsage, setShareUsage] = useState(!isOptedOut());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Derived from profile (DB-backed)
  const vacationOn = !!profile?.vacation_mode;
  const bundlePct = profile?.bundle_discount_pct ?? 0;
  const bundleOn = bundlePct > 0;

  // Address / payout / verification data
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [payout, setPayout] = useState<PayoutMethod | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(true);

  const loadExtras = useCallback(async () => {
    if (!user?.id) {
      setAddress(null);
      setPayout(null);
      setVerification(null);
      setLoadingExtras(false);
      return;
    }
    setLoadingExtras(true);
    try {
      const [a, p, v] = await Promise.all([
        supabase
          .from('shipping_addresses')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('payout_methods')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('verifications')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (!mounted.current) return;
      setAddress((a.data as ShippingAddress | null) ?? null);
      setPayout((p.data as PayoutMethod | null) ?? null);
      setVerification((v.data as Verification | null) ?? null);
    } catch (e) {
      console.warn('[settings] loadExtras failed', e);
    } finally {
      if (mounted.current) setLoadingExtras(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  // Modals
  const [showAddress, setShowAddress] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showBundle, setShowBundle] = useState(false);

  // Open a section (or the Bundle modal) from a deep-link param. `?open=bundle`
  // is the original special case — a modal plus the section that hosts it — and
  // any Section id now also works, so callers elsewhere can land the user on the
  // right card instead of dropping them at the top of a long page. Guard so the
  // effect fires exactly once per arrival: if the user closes the modal or
  // collapses the section, a stale `?open=` in the URL must not reopen it.
  const handledDeepLink = useRef(false);
  useEffect(() => {
    const target = params.open;
    if (!target) {
      handledDeepLink.current = false;
      return;
    }
    if (handledDeepLink.current) return;
    if (target === 'bundle') {
      setShowBundle(true);
      setOpen('shop');
    } else if (SECTIONS.includes(target as Section)) {
      setOpen(target as Section);
    } else {
      // Unknown value — leave the page as-is rather than guessing.
      handledDeepLink.current = false;
      return;
    }
    handledDeepLink.current = true;
  }, [params.open]);

  // ---------- Section toggle ----------
  const toggleSection = useCallback((s: Section) => {
    tap('light');
    setOpen((prev) => (prev === s ? null : s));
  }, []);

  // ---------- Vacation mode (DB) ----------
  const setVacationMode = useCallback(
    async (next: boolean) => {
      if (!user?.id) return;
      tap('light');
      const { error } = await supabase
        .from('profiles')
        .update({ vacation_mode: next })
        .eq('id', user.id);
      if (error) {
        toast.show('Could not update vacation mode', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return;
      }
      await refreshProfile();
      toast.show(next ? 'Vacation mode on' : 'Vacation mode off', {
        variant: next ? 'info' : 'default',
        icon: next ? 'sun' : 'check',
      });
    },
    [user?.id, refreshProfile, toast],
  );

  // ---------- Bundle discount (DB) ----------
  const setBundlePct = useCallback(
    async (pct: number) => {
      if (!user?.id) return;
      const clamped = Math.max(0, Math.min(30, Math.round(pct)));
      const { error } = await supabase
        .from('profiles')
        .update({ bundle_discount_pct: clamped })
        .eq('id', user.id);
      if (error) {
        toast.show('Could not update discount', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return;
      }
      await refreshProfile();
      toast.show(clamped > 0 ? `Bundle discount: ${clamped}%` : 'Bundle discount off', {
        variant: 'success',
        icon: 'check',
      });
    },
    [user?.id, refreshProfile, toast],
  );

  // ---------- Links / share ----------
  const openLink = useCallback(
    async (url: string) => {
      try {
        const can = await Linking.canOpenURL(url);
        if (!can) throw new Error('Cannot open');
        await Linking.openURL(url);
      } catch {
        toast.show('Could not open link', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    },
    [toast],
  );

  const openSystemSettings = useCallback(async () => {
    try {
      if (typeof Linking.openSettings !== 'function') throw new Error();
      await Linking.openSettings();
    } catch {
      toast.show('Open device settings manually', { variant: 'info', icon: 'settings' });
    }
  }, [toast]);

  // ---------- Push notifications ----------
  // Declared after openSystemSettings on purpose: handlePushToggle lists it as a
  // dependency, and a dep array referencing a `const` declared further down the
  // component would hit the temporal dead zone on the very first render.
  useEffect(() => {
    if (Platform.OS === 'web' || !session) return;
    let cancelled = false;
    isThisDeviceRegistered()
      .then((on) => {
        if (!cancelled) setPushOn(on);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handlePushToggle = useCallback(
    async (next: boolean) => {
      if (!user?.id || pushBusy) return;
      setPushBusy(true);
      // Optimistic — the switch should follow the thumb immediately; every
      // failure path below puts it back.
      setPushOn(next);
      try {
        if (next) {
          const { granted, blocked } = await ensurePermissionAndRegister(user.id);
          setPushOn(granted);
          if (!granted) {
            // iOS only shows the permission dialog once. If it was already
            // denied, the only way back is the system settings app.
            if (blocked) {
              toast.show('Enable notifications in system settings', {
                variant: 'info',
                icon: 'bell',
              });
              await openSystemSettings();
            } else {
              toast.show('Notifications not enabled', { variant: 'info', icon: 'bell' });
            }
          }
        } else {
          await unregisterThisDevice();
          setPushOn(false);
        }
      } catch (e) {
        console.warn('[settings] push toggle failed', e);
        setPushOn(!next);
        toast.show('Could not update notifications', { variant: 'info', icon: 'alert-circle' });
      } finally {
        setPushBusy(false);
      }
    },
    [user?.id, pushBusy, toast, openSystemSettings],
  );

  const handleShare = useCallback(async () => {
    if (!profile?.id) return;
    try {
      tap('light');
      await Share.share({
        message: `Check out @${profile.username ?? 'this seller'} on Carrinex`,
        url: `${APP_URL}/user/${profile.id}`,
      });
    } catch {
      toast.show('Share failed', { variant: 'default', icon: 'alert-triangle' });
    }
  }, [profile?.id, profile?.username, toast]);

  // ---------- Auth flows ----------
  const handleLogout = useCallback(async () => {
    if (busy) return;
    const ok = await confirm({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log out',
      destructive: true,
    });
    if (!ok) return;
    setBusy('logout');
    try {
      await signOut();
      toast.show('Signed out', { variant: 'default', icon: 'log-out' });
      router.replace('/(tabs)');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not log out', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [busy, signOut, toast]);

  const handleResetPassword = useCallback(async () => {
    if (!user?.email) {
      toast.show('No email on file', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    if (busy) return;
    const ok = await confirm({
      title: 'Send password reset?',
      message: `We'll email ${user.email} a link to change your password.`,
      confirmLabel: 'Send email',
    });
    if (!ok) return;
    setBusy('password');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email!);
      if (error) throw error;
      toast.show('Reset email sent', { variant: 'success', icon: 'mail' });
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not send email', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [user?.email, busy, toast]);

  const handleDeleteAccount = useCallback(async () => {
    if (busy) return;
    const first = await confirm({
      title: 'Delete account?',
      message:
        'This permanently removes your profile, listings, likes, and messages. This cannot be undone.',
      confirmLabel: 'Continue',
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Are you absolutely sure?',
      message: 'Your account will be deleted immediately.',
      confirmLabel: 'Delete forever',
      destructive: true,
    });
    if (!second) return;
    setBusy('delete');
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await signOut().catch(() => {});
      toast.show('Account deleted', { variant: 'default', icon: 'check' });
      router.replace('/(tabs)');
    } catch (e: any) {
      const subject = encodeURIComponent('Account deletion request');
      const body = encodeURIComponent(
        `Please delete my account.\nUser ID: ${user?.id ?? 'unknown'}\nEmail: ${user?.email ?? 'unknown'}`,
      );
      Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {});
      toast.show(e?.message ?? 'Could not delete now — emailed support', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [busy, user, signOut, toast]);

  const handleComingSoon = useCallback(() => {
    toast.show('Coming soon', { variant: 'info', icon: 'clock' });
  }, [toast]);

  // ---------- Modal save handlers ----------
  const saveAddress = useCallback(
    async (form: AddressForm): Promise<boolean> => {
      if (!user?.id) return false;
      const payload = {
        user_id: user.id,
        recipient_name: form.recipient_name.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim() || null,
        city: form.city.trim(),
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim(),
        country: form.country.trim(),
        phone: form.phone.trim() || null,
        is_default: true,
      };
      const { data, error } = await supabase.rpc('upsert_shipping_address_with_default', {
        p_payload: address?.id ? { ...payload, id: address.id } : payload,
      });

      if (error) {
        toast.show(error.message ?? 'Could not save address', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }

      if (mounted.current) setAddress(data as ShippingAddress);
      toast.show('Address saved', { variant: 'success', icon: 'check' });
      return true;
    },
    [user?.id, address?.id, toast],
  );

  const removeAddress = useCallback(async () => {
    if (!address?.id) return;
    const { error } = await supabase
      .from('shipping_addresses')
      .delete()
      .eq('id', address.id);
    if (error) {
      toast.show('Could not remove', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    if (mounted.current) setAddress(null);
    toast.show('Address removed', { variant: 'default', icon: 'trash-2' });
  }, [address?.id, toast]);

  const savePayout = useCallback(
    async (form: PayoutForm): Promise<boolean> => {
      if (!user?.id) return false;
      const payload = {
        user_id: user.id,
        kind: form.kind,
        label: form.label.trim(),
        account_last4: form.account_last4.trim(),
        is_default: true,
      };
      const { data, error } = await supabase.rpc('set_default_payout', {
        p_payload: payout?.id ? { ...payload, id: payout.id } : payload,
      });

      if (error) {
        toast.show(error.message ?? 'Could not save payout', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }
      if (mounted.current) setPayout(data as PayoutMethod);
      toast.show('Payout method saved', { variant: 'success', icon: 'check' });
      return true;
    },
    [user?.id, payout?.id, toast],
  );

  const removePayout = useCallback(async () => {
    if (!payout?.id) return;
    const { error } = await supabase
      .from('payout_methods')
      .delete()
      .eq('id', payout.id);
    if (error) {
      toast.show('Could not remove', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    if (mounted.current) setPayout(null);
    toast.show('Payout removed', { variant: 'default', icon: 'trash-2' });
  }, [payout?.id, toast]);

  const submitVerification = useCallback(
    async (form: VerifyForm): Promise<boolean> => {
      if (!user?.id) return false;
      const payload = {
        user_id: user.id,
        status: 'submitted' as const,
        legal_name: form.legal_name.trim(),
        document_kind: form.document_kind,
        document_number_last4: form.document_number_last4.trim() || null,
        submitted_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('verifications')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) {
        toast.show(error.message ?? 'Could not submit', {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      }
      if (mounted.current) setVerification(data as Verification);
      toast.show('Verification submitted', { variant: 'success', icon: 'check' });
      return true;
    },
    [user?.id, toast],
  );

  // ---------- Render ----------
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
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
            backgroundColor: 'white',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.hairline,
          }}
        >
          <Feather name="arrow-left" size={18} color={colors.ink} />
        </Pressable>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: colors.ink,
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
        <SettingsHero
          profile={profile}
          hasSession={!!session}
          onEditProfile={() => {
            tap('light');
            router.push('/profile/edit');
          }}
          onSignIn={() => router.push('/auth/login')}
        />

        {/* Sections */}
        <SectionCard
          icon="shopping-bag"
          title="Purchases & Sales"
          subtitle="My shop, promotions & discounts"
          expanded={open === 'shop'}
          onToggle={() => toggleSection('shop')}
        >
          <Row
            // Deliberately NOT "Purchases & sales" — that is this section's own
            // title, and two identical strings in one view make every text
            // locator in tests/e2e/signed-in/settings.spec.ts ambiguous.
            label="Order history"
            desc="Your orders, invoices & payouts"
            // Used to push /(tabs)/profile, whose matching row pushed back here
            // — the two bounced forever and neither showed an order.
            onPress={() => router.push('/orders' as any)}
            chevron
          />
          <Divider />
          <Row
            label="Bundle discount"
            desc={bundleOn ? `Active · ${bundlePct}% off bundles` : 'Tap to set a bundle discount'}
            onPress={() => {
              tap('light');
              setShowBundle(true);
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
            onValueChange={setVacationMode}
            disabled={!user?.id}
          />
          <Divider />
          <Row
            label="Share your profile"
            desc={profile?.username ? `@${profile.username}` : 'Send a link to your shop'}
            onPress={handleShare}
            chevron
            disabled={!profile?.id}
          />
        </SectionCard>

        <SectionCard
          icon="shield"
          title="Verification, payouts & shipping"
          subtitle="Settings for purchases & sales"
          expanded={open === 'verify'}
          onToggle={() => toggleSection('verify')}
        >
          <Row
            label="Identity verification"
            desc={
              loadingExtras
                ? 'Loading…'
                : verification
                  ? `Status: ${verification.status}`
                  : 'Not submitted'
            }
            onPress={() => {
              tap('light');
              setShowVerify(true);
            }}
            chevron
            badge={
              verification?.status === 'approved'
                ? 'Verified'
                : verification?.status === 'submitted'
                  ? 'Pending'
                  : undefined
            }
          />
          <Divider />
          <Row
            label="Payout method"
            desc={
              loadingExtras
                ? 'Loading…'
                : payout
                  ? `${payout.kind === 'bank' ? 'Bank' : 'Wallet'} · ${payout.label} ••${payout.account_last4}`
                  : 'Add a bank or wallet'
            }
            onPress={() => {
              tap('light');
              setShowPayout(true);
            }}
            chevron
          />
          <Divider />
          <Row
            label="Shipping address"
            desc={
              loadingExtras
                ? 'Loading…'
                : address
                  ? `${address.line1}, ${address.city}`
                  : 'Where do we ship from?'
            }
            onPress={() => {
              tap('light');
              setShowAddress(true);
            }}
            chevron
          />
        </SectionCard>

        <SectionCard
          icon="sliders"
          title="Enhance the experience"
          subtitle="Personalization, badges & subscriptions"
          expanded={open === 'enhance'}
          onToggle={() => toggleSection('enhance')}
        >
          {/* Web has no remote push yet (VAPID + service worker is a separate
              slice), so the toggle is native-only rather than shown broken. */}
          {Platform.OS !== 'web' && (
            <>
              <ToggleRow
                label="Push notifications"
                desc="Messages, offers & sales on this device"
                value={pushOn}
                onValueChange={handlePushToggle}
                disabled={pushBusy || !session}
              />
              <Divider />
            </>
          )}
          <Row
            label="Notifications"
            desc="Push, email & in-app"
            onPress={openSystemSettings}
            chevron
          />
          <Divider />
          <Row
            label="Theme & Appearance"
            desc={`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} (${isDark ? 'Dark monotone' : 'Light monotone'})`}
            onPress={cycleTheme}
            chevron
          />
          <Divider />
          <Row
            label="Language"
            desc="English (default)"
            onPress={() => toast.show('Only English for now', { variant: 'info', icon: 'globe' })}
            chevron
          />
          <Divider />
          <Row
            label="Subscriptions"
            desc={profile?.is_pro ? 'Pro · active' : 'Pro features for sellers'}
            onPress={handleComingSoon}
            chevron
            badge={profile?.is_pro ? 'PRO' : 'Soon'}
          />
        </SectionCard>

        <SectionCard
          icon="user"
          title="Manage account"
          subtitle="Email, password & deletion"
          expanded={open === 'account'}
          onToggle={() => toggleSection('account')}
        >
          {user?.email && (
            <>
              <View style={{ paddingVertical: 14 }}>
                <SheetLabel>Email</SheetLabel>
                <Text
                  style={{ fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 4 }}
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
            desc={busy === 'password' ? 'Sending email…' : 'Send a reset link via email'}
            onPress={handleResetPassword}
            chevron
            disabled={busy === 'password' || !user?.email}
            loading={busy === 'password'}
          />
          <Divider />
          <Row
            label="Delete account"
            desc="Permanently remove your data"
            onPress={handleDeleteAccount}
            destructive
            disabled={busy === 'delete'}
            loading={busy === 'delete'}
          />
        </SectionCard>

        <SectionCard
          icon="help-circle"
          title="Help center"
          subtitle="Support & guides"
          expanded={open === 'help'}
          onToggle={() => toggleSection('help')}
        >
          <Row
            label="Contact support"
            desc={SUPPORT_EMAIL}
            onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
            chevron
          />
          <Divider />
          <Row label="Terms of service" onPress={() => openLink(TERMS_URL)} chevron />
          <Divider />
          <Row label="Privacy policy" onPress={() => openLink(PRIVACY_URL)} chevron />
          <Divider />
          <ToggleRow
            label="Share usage data"
            desc="Helps us improve the app. No personal content is collected."
            value={shareUsage}
            onValueChange={(v) => {
              setShareUsage(v);
              setAnalyticsOptOut(!v);
            }}
          />
        </SectionCard>

        {/* Log out CTA */}
        {session && (
          <Pressable
            onPress={handleLogout}
            disabled={busy === 'logout'}
            accessibilityRole="button"
            accessibilityState={{ busy: busy === 'logout' }}
            style={({ pressed }) => ({
              height: 58,
              borderRadius: 16,
              backgroundColor: colors.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
              overflow: 'hidden',
              opacity: busy === 'logout' ? 0.7 : 1,
              transform: [{ scale: pressed && busy !== 'logout' ? 0.985 : 1 }],
            })}
          >
            <View
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 58,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {busy === 'logout' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Feather name="log-out" size={18} color="#FFFFFF" />
              )}
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: 'white', marginRight: 58 }}>
              {busy === 'logout' ? 'Signing out…' : 'Log out'}
            </Text>
          </Pressable>
        )}

        <Text
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'rgba(15,15,15,0.55)',
            marginTop: 18,
            fontWeight: '600',
            letterSpacing: 0.4,
          }}
        >
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </ScrollView>

      {/* Sheets */}
      <BundleDiscountSheet
        visible={showBundle}
        currentPct={bundlePct}
        onClose={() => setShowBundle(false)}
        onSave={async (pct) => {
          await setBundlePct(pct);
          setShowBundle(false);
        }}
      />

      <AddressSheet
        visible={showAddress}
        initial={address}
        onClose={() => setShowAddress(false)}
        onSave={async (form) => {
          const ok = await saveAddress(form);
          if (ok) setShowAddress(false);
        }}
        onRemove={
          address?.id
            ? async () => {
                await removeAddress();
                setShowAddress(false);
              }
            : undefined
        }
      />

      <PayoutSheet
        visible={showPayout}
        initial={payout}
        onClose={() => setShowPayout(false)}
        onSave={async (form) => {
          const ok = await savePayout(form);
          if (ok) setShowPayout(false);
        }}
        onRemove={
          payout?.id
            ? async () => {
                await removePayout();
                setShowPayout(false);
              }
            : undefined
        }
      />

      <VerificationSheet
        visible={showVerify}
        initial={verification}
        onClose={() => setShowVerify(false)}
        onSave={async (form) => {
          const ok = await submitVerification(form);
          if (ok) setShowVerify(false);
        }}
      />
    </SafeAreaView>
  );
}
