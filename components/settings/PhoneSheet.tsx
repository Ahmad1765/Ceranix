import { useEffect, useState } from 'react';
import { Text } from '@/lib/rnText';
import { SheetModal, SheetField, SheetPrimary, SheetDestructive } from './Sheet';

export function PhoneSheet({
  visible,
  initialPhone,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  initialPhone?: string | null;
  onClose: () => void;
  onSave: (phone: string) => Promise<boolean>;
  onRemove?: () => Promise<void>;
}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (visible) {
      setPhoneNumber(initialPhone || '');
      setSaving(false);
      setRemoving(false);
    }
  }, [visible, initialPhone]);

  const cleanPhone = phoneNumber.trim();
  const digits = cleanPhone.replace(/\D/g, '');
  const isValid = digits.length >= 7 && digits.length <= 15;

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={initialPhone ? 'Phone number' : 'Add phone number'}
    >
      <Text style={{ fontSize: 13, color: '#8E8E93', lineHeight: 19, marginBottom: 16 }}>
        Add your mobile phone number for courier dispatch, delivery SMS updates, and buyer/seller notifications.
      </Text>

      <SheetField
        label="Phone number (e.g. +92 300 1234567)"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        placeholder="+92 300 1234567"
        keyboardType="phone-pad"
        error={
          !isValid && cleanPhone.length > 0
            ? 'Please enter a valid phone number (7–15 digits)'
            : undefined
        }
      />

      <SheetPrimary
        label={saving ? 'Saving…' : initialPhone ? 'Update phone number' : 'Save phone number'}
        loading={saving}
        disabled={!isValid || saving || removing}
        onPress={async () => {
          if (!isValid) return;
          setSaving(true);
          try {
            const ok = await onSave(cleanPhone);
            if (ok) onClose();
          } finally {
            setSaving(false);
          }
        }}
      />

      {initialPhone && onRemove && (
        <SheetDestructive
          label={removing ? 'Removing…' : 'Remove phone number'}
          disabled={saving || removing}
          onPress={async () => {
            setRemoving(true);
            try {
              await onRemove();
              onClose();
            } finally {
              setRemoving(false);
            }
          }}
        />
      )}
    </SheetModal>
  );
}
