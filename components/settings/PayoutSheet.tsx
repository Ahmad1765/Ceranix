import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { colors } from '@/lib/theme';
import type { PayoutKind, PayoutMethod } from '@/types';
import {
  SheetModal,
  SheetField,
  SheetLabel,
  SheetChoice,
  SheetPrimary,
  SheetDestructive,
} from './Sheet';

export type PayoutForm = {
  kind: PayoutKind;
  label: string;
  account_last4: string;
};

const KINDS = ['bank', 'wallet'] as const satisfies readonly PayoutKind[];

export function PayoutSheet({
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
  const isBank = form.kind === 'bank';

  return (
    <SheetModal visible={visible} onClose={onClose} title="Payout method">
      <Text style={{ fontSize: 13, color: colors.smoke, lineHeight: 19, marginBottom: 16 }}>
        Add where you want your earnings sent. We never store full account numbers — only the last 4
        digits for your reference.
      </Text>

      <View style={{ marginBottom: 14 }}>
        <SheetLabel style={{ marginBottom: 8, marginLeft: 4 }}>Type</SheetLabel>
        <SheetChoice
          options={KINDS}
          value={form.kind}
          onChange={(kind) => setForm((s) => ({ ...s, kind }))}
          renderLabel={(k) => (k === 'bank' ? 'Bank' : 'Wallet')}
          shape="block"
        />
      </View>

      <SheetField
        label={isBank ? 'Bank label' : 'Wallet label'}
        value={form.label}
        placeholder={isBank ? 'HBL · Main account' : 'JazzCash'}
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
        <SheetDestructive
          label="Remove payout method"
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
