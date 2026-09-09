import React from 'react';
import { ShieldCheckIcon, type ShieldCheckIconProps } from './ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';

export type VintedShieldIconProps = ShieldCheckIconProps;

/** Canonical Buyer Protection shield color matching product page and brand purple */
export const VINTED_SHIELD_COLOR = '#5356EE';

/**
 * Buyer Protection shield icon.
 * Standardized across the entire application to use canonical Indigo Shield (#5356EE)
 * matching the Product Page ShieldCheckIcon.
 */
export function VintedShieldIcon({
  color,
  strokeColor,
  ...props
}: VintedShieldIconProps) {
  const { theme } = useTheme();
  const iconColor = color ?? strokeColor ?? VINTED_SHIELD_COLOR;
  return <ShieldCheckIcon color={iconColor} {...props} />;
}

