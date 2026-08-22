import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { tap } from '@/lib/haptics';
import { getCurrentLocationAddress, POPULAR_CITIES } from '@/lib/location';
import type { ShippingAddress } from '@/types';
import { SheetModal, SheetField, SheetPrimary, SheetDestructive } from './Sheet';

export type AddressForm = {
  recipient_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
};

const EMPTY: AddressForm = {
  recipient_name: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'Pakistan',
  phone: '',
};

export function AddressSheet({
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
  const { profile } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState<AddressForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const prevVisibleRef = useRef(visible);

  useEffect(() => {
    if (!prevVisibleRef.current && visible) {
      const defaultName =
        initial?.recipient_name ||
        profile?.full_name ||
        (profile?.username ? `@${profile.username}` : '');

      let initCity = initial?.city ?? '';
      let initCountry = initial?.country ?? 'Pakistan';
      if (initCity.includes(',')) {
        const parts = initCity.split(',').map((p) => p.trim());
        initCity = parts[0];
        if (parts[1]) initCountry = parts[1];
      }

      let initLine2 = initial?.line2 ?? '';
      if (initLine2.trim() === (initial?.line1 ?? '').trim()) {
        initLine2 = '';
      }

      setForm({
        recipient_name: defaultName,
        line1: initial?.line1 ?? '',
        line2: initLine2,
        city: initCity,
        state: initial?.state ?? '',
        postal_code: initial?.postal_code ?? '',
        country: initCountry,
        phone: initial?.phone ?? '',
      });
      setSaving(false);
      setLocating(false);
    }
    prevVisibleRef.current = visible;
  }, [visible, initial, profile]);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof AddressForm, string>> = {};
    if (!form.recipient_name.trim()) e.recipient_name = 'Recipient name is required';
    if (!form.line1.trim()) e.line1 = 'Street address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.postal_code.trim()) e.postal_code = 'Postal code is required';
    if (!form.country.trim()) e.country = 'Country is required';
    return e;
  }, [form]);

  const canSave = Object.keys(errors).length === 0;

  const set = (patch: Partial<AddressForm>) => {
    const nextPatch = { ...patch };
    // Smart cleaning: if city contains comma (e.g. "Lahore, Pakistan"), split cleanly
    if (typeof nextPatch.city === 'string' && nextPatch.city.includes(',')) {
      const parts = nextPatch.city.split(',').map((p) => p.trim());
      nextPatch.city = parts[0];
      if (parts[1]) {
        nextPatch.country = parts[1];
      }
    }
    setForm((s) => ({ ...s, ...nextPatch }));
  };

  // Location Auto-detect / Location Adder
  const handleUseCurrentLocation = async () => {
    if (locating) return;
    tap('medium');
    setLocating(true);

    try {
      const loc = await getCurrentLocationAddress();
      setForm((s) => ({
        ...s,
        line1: loc.line1 || s.line1,
        city: loc.city || s.city,
        state: loc.state || s.state,
        postal_code: loc.postal_code || s.postal_code,
        country: loc.country || s.country || 'Pakistan',
      }));

      toast.show('Address auto-filled from your location', {
        variant: 'default',
        icon: 'check',
      });
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not detect location', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setLocating(false);
    }
  };

  // Quick city selector helper
  const handleSelectCity = (cityName: string) => {
    tap('light');
    let state = form.state;
    if (['Lahore', 'Faisalabad', 'Multan', 'Rawalpindi', 'Gujranwala', 'Sialkot'].includes(cityName)) {
      state = 'Punjab';
    } else if (['Karachi', 'Hyderabad', 'Sukkur'].includes(cityName)) {
      state = 'Sindh';
    } else if (['Islamabad'].includes(cityName)) {
      state = 'Islamabad Capital Territory';
    } else if (['Peshawar'].includes(cityName)) {
      state = 'Khyber Pakhtunkhwa';
    } else if (['Quetta'].includes(cityName)) {
      state = 'Balochistan';
    }

    setForm((s) => ({
      ...s,
      city: cityName,
      state: state || s.state,
      country: s.country || 'Pakistan',
    }));
  };

  const { theme } = useTheme();

  return (
    <SheetModal visible={visible} onClose={onClose} title="Shipping address">
      {/* ── Location Adder Action ────────────────────────────────────────── */}
      <View
        style={{
          marginBottom: 16,
          backgroundColor: theme.panel,
          borderRadius: 16,
          padding: 12,
        }}
      >
        <Pressable
          onPress={handleUseCurrentLocation}
          disabled={locating}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: locating ? theme.primarySoft : theme.surface,
            borderRadius: 12,
            paddingVertical: 11,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: theme.border,
            gap: 8,
            opacity: pressed ? 0.8 : 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
          })}
        >
          {locating ? (
            <>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.accent }}>
                Detecting your location…
              </Text>
            </>
          ) : (
            <>
              <Feather name="navigation" size={15} color={theme.accent} />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.accent }}>
                Use Current Location (GPS Auto-fill)
              </Text>
            </>
          )}
        </Pressable>

        {/* Quick city suggestions */}
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '600', marginBottom: 6 }}>
            QUICK CITY SELECT:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {POPULAR_CITIES.map((c) => {
              const isSelected = form.city.toLowerCase() === c.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => handleSelectCity(c)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: isSelected ? theme.accent : theme.surface,
                    borderWidth: 1,
                    borderColor: isSelected ? theme.accent : theme.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected ? '800' : '600',
                      color: isSelected ? (theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF') : theme.text,
                    }}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Form Fields ─────────────────────────────────────────────────── */}
      <SheetField
        label="Recipient name"
        placeholder="Full name of person receiving the package"
        value={form.recipient_name}
        onChangeText={(t) => set({ recipient_name: t.slice(0, 80) })}
        error={errors.recipient_name}
      />

      <SheetField
        label="Address line 1 (Street / House / Block)"
        placeholder="e.g. House #12, Street 4, Block C, Johar Town"
        value={form.line1}
        onChangeText={(t) => set({ line1: t.slice(0, 120) })}
        error={errors.line1}
      />

      <SheetField
        label="Address line 2 (Optional landmark / suite)"
        placeholder="e.g. Near Shell pump, Flat 3B"
        value={form.line2}
        onChangeText={(t) => set({ line2: t.slice(0, 120) })}
      />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SheetField
            label="City"
            placeholder="e.g. Lahore"
            value={form.city}
            onChangeText={(t) => set({ city: t.slice(0, 60) })}
            error={errors.city}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SheetField
            label="State / region"
            placeholder="e.g. Punjab"
            value={form.state}
            onChangeText={(t) => set({ state: t.slice(0, 60) })}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SheetField
            label="Postal code"
            placeholder="e.g. 54000"
            value={form.postal_code}
            keyboardType="number-pad"
            onChangeText={(t) => set({ postal_code: t.slice(0, 20) })}
            error={errors.postal_code}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SheetField
            label="Country"
            placeholder="e.g. Pakistan"
            value={form.country}
            onChangeText={(t) => set({ country: t.slice(0, 60) })}
            error={errors.country}
          />
        </View>
      </View>

      <SheetField
        label="Phone (for courier delivery)"
        placeholder="e.g. 03xxxxxxxxx"
        value={form.phone}
        keyboardType="phone-pad"
        onChangeText={(t) => set({ phone: t.slice(0, 30) })}
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
        <SheetDestructive
          label="Remove address"
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            await onRemove();
            setSaving(false);
          }}
        />
      )}
    </SheetModal>
  );
}
