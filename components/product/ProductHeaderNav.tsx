// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT HEADER NAV (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Seamless Floating-to-Sticky Navigation Transitions
// This component renders the top navigation bar with dynamic opacity and title
// transitions driven by scroll position.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { FloatingHeader } from '@/components/navigation/FloatingHeader';
import { formatPrice } from '@/lib/currency';

type ProductHeaderNavProps = {
  showStickyHeader: boolean;
  title?: string | null;
  price?: number | null;
  onBack: () => void;
};

export const ProductHeaderNav = memo(function ProductHeaderNav({
  showStickyHeader,
  title,
  price,
  onBack,
}: ProductHeaderNavProps) {
  return (
    <FloatingHeader
      onBack={onBack}
      title={showStickyHeader && title ? title : undefined}
      subtitle={showStickyHeader && price != null ? formatPrice(price, { whole: true }) : undefined}
      transparent={!showStickyHeader}
    />
  );
});
