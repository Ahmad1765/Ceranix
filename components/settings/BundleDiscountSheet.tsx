import { useEffect, useState } from 'react';
import { Text } from '@/lib/rnText';
import { colors } from '@/lib/theme';
import { SheetModal, SheetChoice, SheetPrimary } from './Sheet';

const OPTIONS = [0, 5, 10, 15, 20] as const;

export function BundleDiscountSheet({
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

  const unchanged = selected === currentPct;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Bundle discount">
      <Text style={{ fontSize: 13, color: colors.smoke, lineHeight: 19, marginBottom: 16 }}>
        Offer a discount when buyers purchase multiple items from your shop in one go.
      </Text>
      <SheetChoice
        options={OPTIONS}
        value={selected}
        onChange={setSelected}
        renderLabel={(pct) => (pct === 0 ? 'Off' : `${pct}%`)}
        style={{ marginBottom: 18 }}
      />
      <SheetPrimary
        label={saving ? 'Saving…' : unchanged ? 'Done' : 'Save discount'}
        loading={saving}
        disabled={saving}
        onPress={async () => {
          if (unchanged) {
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
