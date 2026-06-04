import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Switch,
  Platform,
  Share,
  Linking,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/lib/confirm';
import { safeBack } from '@/lib/nav';
import type {
  DocumentKind,
  PayoutKind,
  PayoutMethod,
  ShippingAddress,
  Verification,
} from '@/types';

const LIME = '#6C47FF';
const INK = '#0F0F0F';
const MUTE = 'rgba(15,15,15,0.62)';
const SOFT = '#FFFFFF';
const HAIR = 'rgba(15,15,15,0.08)';
const RED = '#0F0F0F';

const SUPPORT_EMAIL = 'support@carrinex.app';
const TERMS_URL = 'https://carrinex.vercel.app/terms';
const PRIVACY_URL = 'https://carrinex.vercel.app/privacy';
const APP_URL_BASE = 'https://carrinex.vercel.app';
const BUNDLE_DEFAULT_PCT = 10;

type Section = 'shop' | 'verify' | 'enhance' | 'account' | 'help';
type Busy = 'logout' | 'delete' | 'password' | null;

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

export default function SettingsScreen() {
  const { profile, user, session, signOut, refreshProfile } = useAuth();
  const toast = useToast();
  // Deep-link param: profile shop list passes `?open=bundle` so tapping the
  // Bundle row jumps straight into the modal instead of forcing the user to
  // scroll the settings page to find it.
  const params = useLocalSearchParams<{ open?: string }>();

  const [open, setOpen] = useState<Section | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
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

  // Open modal from a deep-link param. Guard so the effect fires exactly
  // once per arrival — if the user closes the modal we don't want a stale
  // `?open=bundle` in the URL to reopen it.
  const handledDeepLink = useRef(false);
  useEffect(() => {
    if (handledDeepLink.current) return;
    if (params.open === 'bundle') {
      setShowBundle(true);
      setOpen('shop');
      handledDeepLink.current = true;
    }
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

  const handleShare = useCallback(async () => {
    if (!profile?.id) return;
    try {
      tap('light');
      await Share.share({
        message: `Check out @${profile.username ?? 'this seller'} on Carrinex`,
        url: `${APP_URL_BASE}/user/${profile.id}`,
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

  const initial =
    ((profile?.full_name || profile?.username || 'U').trim().charAt(0) || 'U').toUpperCase();

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
      const { data, error } = address?.id
        ? await supabase
            .from('shipping_addresses')
            .update(payload)
            .eq('id', address.id)
            .select('*')
            .single()
        : await supabase.from('shipping_addresses').insert(payload).select('*').single();
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
      const { data, error } = payout?.id
        ? await supabase
            .from('payout_methods')
            .update(payload)
            .eq('id', payout.id)
            .select('*')
            .single()
        : await supabase.from('payout_methods').insert(payload).select('*').single();
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: SOFT }}>
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
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: 'white',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: HAIR,
          }}
        >
          <Feather name="arrow-left" size={18} color={INK} />
        </Pressable>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: INK,
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
        {/* Hero */}
        <Text
          style={{
            fontSize: 44,
            fontWeight: '900',
            color: INK,
            lineHeight: 46,
            letterSpacing: -1.5,
            marginTop: 6,
          }}
        >
          Your{'\n'}settings.
        </Text>
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 22,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: LIME,
              marginRight: 10,
            }}
          />
          <Text style={{ fontSize: 14, color: MUTE, lineHeight: 20, flex: 1 }}>
            Manage your shop, account and how you appear on Carrinex.
          </Text>
        </View>

        {/* Profile hero card */}
        {profile ? (
          <Pressable
            onPress={() => {
              tap('light');
              router.push('/profile/edit');
            }}
            style={({ pressed }) => ({
              backgroundColor: INK,
              borderRadius: 24,
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 20,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: LIME,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                marginRight: 14,
              }}
            >
              {profile.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{ width: 56, height: 56 }}
                  contentFit="cover"
                />
              ) : (
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF' }}>{initial}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{ fontSize: 17, fontWeight: '800', color: 'white' }}
                  numberOfLines={1}
                >
                  {profile.full_name || profile.username}
                </Text>
                {profile.is_verified && (
                  <View style={{ marginLeft: 6 }}>
                    <Feather name="check-circle" size={14} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.6)',
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                @{profile.username} · Tap to edit profile
              </Text>
            </View>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: LIME,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="edit-2" size={16} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : session ? (
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 20,
              padding: 20,
              marginBottom: 20,
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: HAIR,
            }}
          >
            <ActivityIndicator color={INK} />
          </View>
        ) : (
          <Pressable
            onPress={() => router.push('/auth/login')}
            style={({ pressed }) => ({
              backgroundColor: INK,
              borderRadius: 20,
              padding: 18,
              marginBottom: 20,
              flexDirection: 'row',
              alignItems: 'center',
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: LIME,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
              }}
            >
              <Feather name="log-in" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>Sign in</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                Access your shop and listings
              </Text>
            </View>
            <Feather name="arrow-right" size={18} color="white" />
          </Pressable>
        )}

        {/* Sections */}
        <SectionCard
          icon="shopping-bag"
          title="Purchases & Sales"
          subtitle="My shop, promotions & discounts"
          expanded={open === 'shop'}
          onToggle={() => toggleSection('shop')}
        >
          <Row
            label="My shop"
            desc="View purchased & sold items, payouts"
            onPress={() => router.push('/(tabs)/profile')}
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
          <Row
            label="Notifications"
            desc="Push, email & in-app"
            onPress={openSystemSettings}
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
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: MUTE,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                  }}
                >
                  Email
                </Text>
                <Text
                  style={{ fontSize: 14, fontWeight: '700', color: INK, marginTop: 4 }}
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
        </SectionCard>

        {/* Log out CTA */}
        {session && (
          <Pressable
            onPress={handleLogout}
            disabled={busy === 'logout'}
            style={({ pressed }) => ({
              height: 58,
              borderRadius: 16,
              backgroundColor: INK,
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
                backgroundColor: LIME,
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
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: 'white',
                marginRight: 58,
              }}
            >
              {busy === 'logout' ? 'Signing out…' : 'Log out'}
            </Text>
          </Pressable>
        )}

        <Text
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'rgba(15,15,15,0.45)',
            marginTop: 18,
            fontWeight: '600',
            letterSpacing: 0.4,
          }}
        >
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </ScrollView>

      {/* Modals */}
      <BundleDiscountModal
        visible={showBundle}
        currentPct={bundlePct}
        onClose={() => setShowBundle(false)}
        onSave={async (pct) => {
          await setBundlePct(pct);
          setShowBundle(false);
        }}
      />

      <AddressModal
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

      <PayoutModal
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

      <VerificationModal
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

// =============================================================================
// Modal: Bundle discount picker
// =============================================================================
function BundleDiscountModal({
  visible,
  currentPct,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentPct: number;
  onClose: () => void;
  onSave: (pct: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number>(currentPct);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(currentPct);
      setSaving(false);
    }
  }, [visible, currentPct]);

  const options = [0, 5, 10, 15, 20];

  return (
    <SheetModal visible={visible} onClose={onClose} title="Bundle discount">
      <Text style={{ fontSize: 13, color: MUTE, lineHeight: 19, marginBottom: 16 }}>
        Offer a discount when buyers purchase multiple items from your shop in one go.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {options.map((pct) => {
          const active = selected === pct;
          return (
            <Pressable
              key={pct}
              onPress={() => {
                tap('light');
                setSelected(pct);
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: active ? INK : 'white',
                borderWidth: 1.5,
                borderColor: active ? INK : HAIR,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: active ? 'white' : INK,
                }}
              >
                {pct === 0 ? 'Off' : `${pct}%`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <SheetPrimary
        label={saving ? 'Saving…' : selected === currentPct ? 'Done' : 'Save discount'}
        loading={saving}
        disabled={saving}
        onPress={async () => {
          if (selected === currentPct) {
            onClose();
            return;
          }
          setSaving(true);
          await onSave(selected);
          setSaving(false);
        }}
      />
    </SheetModal>
  );
}

// =============================================================================
// Modal: Address
// =============================================================================
type AddressForm = {
  recipient_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
};

function AddressModal({
  visible,
  initial,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  initial: ShippingAddress | null;
  onClose: () => void;
  onSave: (form: AddressForm) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [form, setForm] = useState<AddressForm>({
    recipient_name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm({
        recipient_name: initial?.recipient_name ?? '',
        line1: initial?.line1 ?? '',
        line2: initial?.line2 ?? '',
        city: initial?.city ?? '',
        state: initial?.state ?? '',
        postal_code: initial?.postal_code ?? '',
        country: initial?.country ?? '',
        phone: initial?.phone ?? '',
      });
      setSaving(false);
    }
  }, [visible, initial]);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof AddressForm, string>> = {};
    if (!form.recipient_name.trim()) e.recipient_name = 'Required';
    if (!form.line1.trim()) e.line1 = 'Required';
    if (!form.city.trim()) e.city = 'Required';
    if (!form.postal_code.trim()) e.postal_code = 'Required';
    if (!form.country.trim()) e.country = 'Required';
    return e;
  }, [form]);

  const canSave = Object.keys(errors).length === 0;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Shipping address">
      <SheetField
        label="Recipient name"
        value={form.recipient_name}
        onChangeText={(t) => setForm((s) => ({ ...s, recipient_name: t.slice(0, 80) }))}
        error={errors.recipient_name}
      />
      <SheetField
        label="Address line 1"
        value={form.line1}
        onChangeText={(t) => setForm((s) => ({ ...s, line1: t.slice(0, 120) }))}
        error={errors.line1}
      />
      <SheetField
        label="Address line 2 (optional)"
        value={form.line2}
        onChangeText={(t) => setForm((s) => ({ ...s, line2: t.slice(0, 120) }))}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SheetField
            label="City"
            value={form.city}
            onChangeText={(t) => setForm((s) => ({ ...s, city: t.slice(0, 60) }))}
            error={errors.city}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SheetField
            label="State / region"
            value={form.state}
            onChangeText={(t) => setForm((s) => ({ ...s, state: t.slice(0, 60) }))}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SheetField
            label="Postal code"
            value={form.postal_code}
            onChangeText={(t) => setForm((s) => ({ ...s, postal_code: t.slice(0, 20) }))}
            error={errors.postal_code}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SheetField
            label="Country"
            value={form.country}
            onChangeText={(t) => setForm((s) => ({ ...s, country: t.slice(0, 60) }))}
            error={errors.country}
          />
        </View>
      </View>
      <SheetField
        label="Phone (optional)"
        value={form.phone}
        keyboardType="phone-pad"
        onChangeText={(t) => setForm((s) => ({ ...s, phone: t.slice(0, 30) }))}
      />

      <SheetPrimary
        label={saving ? 'Saving…' : initial ? 'Update address' : 'Save address'}
        loading={saving}
        disabled={!canSave || saving}
        onPress={async () => {
          if (!canSave) return;
          setSaving(true);
          await onSave(form);
          setSaving(false);
        }}
      />
      {onRemove && (
        <Pressable
          onPress={async () => {
            setSaving(true);
            await onRemove();
            setSaving(false);
          }}
          disabled={saving}
          style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
        >
          <Text style={{ color: RED, fontWeight: '700', fontSize: 13 }}>Remove address</Text>
        </Pressable>
      )}
    </SheetModal>
  );
}

// =============================================================================
// Modal: Payout
// =============================================================================
type PayoutForm = {
  kind: PayoutKind;
  label: string;
  account_last4: string;
};

function PayoutModal({
  visible,
  initial,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  initial: PayoutMethod | null;
  onClose: () => void;
  onSave: (form: PayoutForm) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [form, setForm] = useState<PayoutForm>({ kind: 'bank', label: '', account_last4: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm({
        kind: initial?.kind ?? 'bank',
        label: initial?.label ?? '',
        account_last4: initial?.account_last4 ?? '',
      });
      setSaving(false);
    }
  }, [visible, initial]);

  const last4Valid = /^[0-9]{4}$/.test(form.account_last4);
  const labelValid = form.label.trim().length >= 2;
  const canSave = last4Valid && labelValid;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Payout method">
      <Text style={{ fontSize: 13, color: MUTE, lineHeight: 19, marginBottom: 16 }}>
        Add where you want your earnings sent. We never store full account numbers — only the last 4
        digits for your reference.
      </Text>

      <View style={{ marginBottom: 14 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: MUTE,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          Type
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['bank', 'wallet'] as const).map((k) => {
            const active = form.kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  tap('light');
                  setForm((s) => ({ ...s, kind: k }));
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: active ? INK : 'white',
                  borderWidth: 1.5,
                  borderColor: active ? INK : HAIR,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: active ? 'white' : INK,
                    textTransform: 'capitalize',
                  }}
                >
                  {k}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SheetField
        label={form.kind === 'bank' ? 'Bank label' : 'Wallet label'}
        value={form.label}
        placeholder={form.kind === 'bank' ? 'HBL · Main account' : 'JazzCash'}
        onChangeText={(t) => setForm((s) => ({ ...s, label: t.slice(0, 60) }))}
        error={!labelValid && form.label.length > 0 ? 'At least 2 characters' : undefined}
      />
      <SheetField
        label="Last 4 digits"
        value={form.account_last4}
        placeholder="1234"
        keyboardType="number-pad"
        onChangeText={(t) =>
          setForm((s) => ({ ...s, account_last4: t.replace(/[^0-9]/g, '').slice(0, 4) }))
        }
        error={!last4Valid && form.account_last4.length > 0 ? 'Must be 4 digits' : undefined}
      />

      <SheetPrimary
        label={saving ? 'Saving…' : initial ? 'Update payout' : 'Save payout'}
        loading={saving}
        disabled={!canSave || saving}
        onPress={async () => {
          if (!canSave) return;
          setSaving(true);
          await onSave(form);
          setSaving(false);
        }}
      />
      {onRemove && (
        <Pressable
          onPress={async () => {
            setSaving(true);
            await onRemove();
            setSaving(false);
          }}
          disabled={saving}
          style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
        >
          <Text style={{ color: RED, fontWeight: '700', fontSize: 13 }}>Remove payout method</Text>
        </Pressable>
      )}
    </SheetModal>
  );
}

// =============================================================================
// Modal: Verification
// =============================================================================
type VerifyForm = {
  legal_name: string;
  document_kind: DocumentKind;
  document_number_last4: string;
};

function VerificationModal({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: Verification | null;
  onClose: () => void;
  onSave: (form: VerifyForm) => Promise<void>;
}) {
  const [form, setForm] = useState<VerifyForm>({
    legal_name: '',
    document_kind: 'national_id',
    document_number_last4: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm({
        legal_name: initial?.legal_name ?? '',
        document_kind: (initial?.document_kind as DocumentKind) ?? 'national_id',
        document_number_last4: initial?.document_number_last4 ?? '',
      });
      setSaving(false);
    }
  }, [visible, initial]);

  const nameValid = form.legal_name.trim().length >= 2;
  const last4Valid =
    form.document_number_last4.length === 0 || /^[A-Za-z0-9]{2,6}$/.test(form.document_number_last4);
  const canSave = nameValid && last4Valid && initial?.status !== 'approved';

  const KIND_LABELS: Record<DocumentKind, string> = {
    passport: 'Passport',
    national_id: 'National ID',
    drivers_license: "Driver's license",
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Identity verification">
      {initial?.status === 'approved' ? (
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: LIME,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Feather name="check" size={24} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '800', color: INK }}>You're verified</Text>
          <Text style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>
            Approved on {initial.reviewed_at?.slice(0, 10) ?? '—'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: MUTE, lineHeight: 19, marginBottom: 16 }}>
            Submit your details to verify your identity. We typically review within 2–3 business days.
          </Text>
          {initial?.status === 'submitted' && (
            <View
              style={{
                backgroundColor: SOFT,
                borderRadius: 14,
                padding: 12,
                marginBottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Feather name="clock" size={14} color={INK} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 12, color: INK, fontWeight: '700' }}>
                Already submitted — under review
              </Text>
            </View>
          )}

          <SheetField
            label="Legal name (as on document)"
            value={form.legal_name}
            onChangeText={(t) => setForm((s) => ({ ...s, legal_name: t.slice(0, 100) }))}
            error={!nameValid && form.legal_name.length > 0 ? 'At least 2 characters' : undefined}
          />

          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: MUTE,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 8,
              marginLeft: 4,
            }}
          >
            Document type
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(Object.keys(KIND_LABELS) as DocumentKind[]).map((k) => {
              const active = form.document_kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                    tap('light');
                    setForm((s) => ({ ...s, document_kind: k }));
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: active ? INK : 'white',
                    borderWidth: 1.5,
                    borderColor: active ? INK : HAIR,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: active ? 'white' : INK,
                    }}
                  >
                    {KIND_LABELS[k]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SheetField
            label="Last 4 characters of document (optional)"
            value={form.document_number_last4}
            onChangeText={(t) =>
              setForm((s) => ({
                ...s,
                document_number_last4: t.replace(/[^A-Za-z0-9]/g, '').slice(0, 6),
              }))
            }
            error={!last4Valid && form.document_number_last4.length > 0 ? '2–6 characters' : undefined}
          />

          <SheetPrimary
            label={saving ? 'Submitting…' : initial ? 'Resubmit' : 'Submit for review'}
            loading={saving}
            disabled={!canSave || saving}
            onPress={async () => {
              if (!canSave) return;
              setSaving(true);
              await onSave(form);
              setSaving(false);
            }}
          />
        </>
      )}
    </SheetModal>
  );
}

// =============================================================================
// Shared modal shell + primitives
// =============================================================================
function SheetModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(15,15,15,0.45)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View
            style={{
              backgroundColor: SOFT,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === 'ios' ? 32 : 20,
              maxHeight: '88%',
            }}
          >
            {/* Handle */}
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: HAIR,
                marginBottom: 12,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '900',
                  color: INK,
                  letterSpacing: -0.6,
                }}
              >
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: 'white',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: HAIR,
                }}
              >
                <Feather name="x" size={16} color={INK} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SheetField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? RED : focused ? INK : HAIR;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: error ? RED : focused ? INK : MUTE,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 6,
          marginLeft: 4,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: 14,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor="rgba(15,15,15,0.45)"
          keyboardType={keyboardType}
          style={{ fontSize: 15, color: INK, padding: 0 }}
        />
      </View>
      {error && (
        <Text style={{ fontSize: 11, color: RED, marginTop: 4, marginLeft: 4, fontWeight: '600' }}>
          {error}
        </Text>
      )}
    </View>
  );
}

function SheetPrimary({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: 16,
        backgroundColor: disabled ? INK : LIME,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// =============================================================================
// Settings row primitives
// =============================================================================
function SectionCard({
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: 'white',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: expanded ? INK : HAIR,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: expanded ? LIME : SOFT,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
          }}
        >
          <Feather name={icon} size={18} color={expanded ? '#FFFFFF' : INK} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: INK, letterSpacing: -0.2 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: MUTE, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: SOFT,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={expanded ? 'minus' : 'plus'} size={14} color={INK} />
        </View>
      </Pressable>
      {expanded && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 4,
            borderTopWidth: 1,
            borderTopColor: HAIR,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

function Row({
  label,
  desc,
  onPress,
  chevron,
  destructive,
  disabled,
  loading,
  badge,
}: {
  label: string;
  desc?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: destructive ? RED : INK,
            }}
          >
            {label}
          </Text>
          {badge && (
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: LIME,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 }}>
                {badge.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {desc && <Text style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>{desc}</Text>}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={destructive ? RED : MUTE} />
      ) : chevron ? (
        <Feather name="chevron-right" size={16} color={destructive ? RED : MUTE} />
      ) : null}
    </Pressable>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>{label}</Text>
        {desc && <Text style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          tap('light');
          onValueChange(v);
        }}
        disabled={disabled}
        trackColor={{ false: 'rgba(15,15,15,0.12)', true: LIME }}
        thumbColor={value ? '#FFFFFF' : '#FFFFFF'}
        ios_backgroundColor="rgba(15,15,15,0.12)"
      />
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: HAIR }} />;
}
