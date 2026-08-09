import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
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
  country: '',
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
  const [form, setForm] = useState<AddressForm>(EMPTY);
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
  const set = (patch: Partial<AddressForm>) => setForm((s) => ({ ...s, ...patch }));

  return (
    <SheetModal visible={visible} onClose={onClose} title="Shipping address">
      <SheetField
        label="Recipient name"
        value={form.recipient_name}
        onChangeText={(t) => set({ recipient_name: t.slice(0, 80) })}
        error={errors.recipient_name}
      />
      <SheetField
        label="Address line 1"
        value={form.line1}
        onChangeText={(t) => set({ line1: t.slice(0, 120) })}
        error={errors.line1}
      />
      <SheetField
        label="Address line 2 (optional)"
        value={form.line2}
        onChangeText={(t) => set({ line2: t.slice(0, 120) })}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SheetField
            label="City"
            value={form.city}
            onChangeText={(t) => set({ city: t.slice(0, 60) })}
            error={errors.city}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SheetField
            label="State / region"
            value={form.state}
            onChangeText={(t) => set({ state: t.slice(0, 60) })}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SheetField
            label="Postal code"
            value={form.postal_code}
            onChangeText={(t) => set({ postal_code: t.slice(0, 20) })}
            error={errors.postal_code}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SheetField
            label="Country"
            value={form.country}
            onChangeText={(t) => set({ country: t.slice(0, 60) })}
            error={errors.country}
          />
        </View>
      </View>
      <SheetField
        label="Phone (optional)"
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
