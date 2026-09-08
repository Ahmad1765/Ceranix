import React from 'react';
import { ShieldCheckIcon, type ShieldCheckIconProps } from './ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';

export type VintedShieldIconProps = ShieldCheckIconProps;

/** Canonical Buyer Protection shield color matching product page and brand purple */
export const VINTED_SHIELD_COLOR = '#6C47FF';

/**
 * Buyer Protection shield icon.
 * Standardized across the entire application to use canonical Signal Purple (#6C47FF)
 * matching the Product Page ShieldCheckIcon.
 */
export function VintedShieldIcon({
  color,
  strokeColor,
  ...props
}: VintedShieldIconProps) {
  const { theme } = useTheme();
  const iconColor = color ?? strokeColor ?? theme.purple ?? VINTED_SHIELD_COLOR;
  return <ShieldCheckIcon color={iconColor} {...props} />;
}

