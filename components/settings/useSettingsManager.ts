// ─────────────────────────────────────────────────────────────────────────────
// USE SETTINGS MANAGER HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Consolidating Account Management & System Preferences
//
// 1. Unified Mutation Lifecycles:
//    Isolates address CRUD, payout method management, identity verification submissions,
//    push notification device registration, and auth lifecycle flows (password resets,
//    sign out, account deletion) into a cohesive domain state machine.
//
// 2. Deep Link Handling:
//    Supports direct URL deep-linking into specific settings sections (e.g. `?open=bundle`)
//    with one-time execution guards.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Share, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  ensurePermissionAndRegister,
  isThisDeviceRegistered,
  unregisterThisDevice,
} from '@/lib/notifications';
import { confirm } from '@/lib/confirm';
import { tap } from '@/lib/haptics';
import { isOptedOut, setAnalyticsOptOut } from '@/lib/analytics';
import { APP_URL } from '@/lib/brand';
import type {
  AddressForm,
  PayoutForm,
  VerifyForm,
} from '@/components/settings';
import type { PayoutMethod, ShippingAddress, Verification } from '@/types';

export const SUPPORT_EMAIL = 'support@carrinex.app';
export const TERMS_URL = `${APP_URL}/terms`;
export const PRIVACY_URL = `${APP_URL}/privacy`;

export type Section = 'shop' | 'verify' | 'enhance' | 'account' | 'help';
export const SECTIONS: readonly Section[] = ['shop', 'verify', 'enhance', 'account', 'help'];
export type Busy = 'logout' | 'delete' | 'password' | null;

export function useSettingsManager() {
  const { profile, user, session, signOut, refreshProfile } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ open?: string }>();

  const [open, setOpen] = useState<Section | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [shareUsage, setShareUsage] = useState(!isOptedOut());
  const mounted = useRef(true);

  // Address / Payout / Verification Data
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [payout, setPayout] = useState<PayoutMethod | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(true);

  // Modal Visibility States
  const [showAddress, setShowAddress] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showBundle, setShowBundle] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── 1. Fetch Extras (Address, Payout, Verification) ───────────────────────
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

  // ── 2. Deep-Link Handler ──────────────────────────────────────────────────
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
      handledDeepLink.current = false;
      return;
    }
    handledDeepLink.current = true;
  }, [params.open]);

  // ── 3. Section Toggling ───────────────────────────────────────────────────
  const toggleSection = useCallback((s: Section) => {
    tap('light');
    setOpen((prev) => (prev === s ? null : s));
  }, []);

  // ── 4. DB Sync Actions (Vacation, Bundle, Push, Analytics) ────────────────
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

  const openSystemSettings = useCallback(async () => {
    try {
      if (typeof Linking.openSettings !== 'function') throw new Error();
      await Linking.openSettings();
    } catch {
      toast.show('Open device settings manually', { variant: 'info', icon: 'settings' });
    }
  }, [toast]);

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
      setPushOn(next);
      try {
        if (next) {
          const { granted, blocked } = await ensurePermissionAndRegister(user.id);
          setPushOn(granted);
          if (!granted) {
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

  // ── 5. Auth Lifecycle Flows ──────────────────────────────────────────────
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

  // ── 6. Address / Payout / Verify Form Handlers ───────────────────────────
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

  const saveVerification = useCallback(
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

  return {
    open,
    setOpen,
    toggleSection,
    busy,
    pushOn,
    handlePushToggle,
    shareUsage,
    setShareUsage: (on: boolean) => {
      setShareUsage(on);
      setAnalyticsOptOut(!on);
    },
    address,
    payout,
    verification,
    loadingExtras,
    showAddress,
    setShowAddress,
    showPayout,
    setShowPayout,
    showVerify,
    setShowVerify,
    showBundle,
    setShowBundle,
    showTheme,
    setShowTheme,
    showSubscription,
    setShowSubscription,
    setVacationMode,
    setBundlePct,
    saveAddress,
    removeAddress,
    savePayout,
    removePayout,
    saveVerification,
    handleLogout,
    handleResetPassword,
    handleDeleteAccount,
    openSystemSettings,
  };
}
