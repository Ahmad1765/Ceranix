import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '@/lib/theme';
import type { DocumentKind, Verification } from '@/types';
import { SheetModal, SheetField, SheetLabel, SheetChoice, SheetPrimary } from './Sheet';

export type VerifyForm = {
  legal_name: string;
  document_kind: DocumentKind;
  document_number_last4: string;
};

const KIND_LABELS: Record<DocumentKind, string> = {
  passport: 'Passport',
  national_id: 'National ID',
  drivers_license: "Driver's license",
};

const KINDS = Object.keys(KIND_LABELS) as DocumentKind[];

export function VerificationSheet({
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

  return (
    <SheetModal visible={visible} onClose={onClose} title="Identity verification">
      {initial?.status === 'approved' ? (
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Feather name="check" size={24} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>
            You&apos;re verified
          </Text>
          <Text style={{ fontSize: 13, color: colors.smoke, marginTop: 4 }}>
            Approved on {initial.reviewed_at?.slice(0, 10) ?? '—'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: colors.smoke, lineHeight: 19, marginBottom: 16 }}>
            Submit your details to verify your identity. We typically review within 2–3 business days.
          </Text>
          {initial?.status === 'submitted' && (
            <View
              style={{
                backgroundColor: colors.white,
                borderRadius: 14,
                padding: 12,
                marginBottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Feather name="clock" size={14} color={colors.ink} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 12, color: colors.ink, fontWeight: '700' }}>
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

          <SheetLabel style={{ marginBottom: 8, marginLeft: 4 }}>Document type</SheetLabel>
          <SheetChoice
            options={KINDS}
            value={form.document_kind}
            onChange={(document_kind) => setForm((s) => ({ ...s, document_kind }))}
            renderLabel={(k) => KIND_LABELS[k]}
            style={{ marginBottom: 14 }}
          />

          <SheetField
            label="Last 4 characters of document (optional)"
            value={form.document_number_last4}
            onChangeText={(t) =>
              setForm((s) => ({
                ...s,
                document_number_last4: t.replace(/[^A-Za-z0-9]/g, '').slice(0, 6),
              }))
            }
            error={
              !last4Valid && form.document_number_last4.length > 0 ? '2–6 characters' : undefined
            }
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
