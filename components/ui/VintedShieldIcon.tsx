import React from 'react';
import { ShieldCheckIcon, type ShieldCheckIconProps } from './ShieldCheckIcon';

export type VintedShieldIconProps = ShieldCheckIconProps;

/** Distinct vibrant buyer protection teal from Vinted's design system */
export const VINTED_SHIELD_COLOR = '#007782';

/**
 * Vinted-style vibrant Buyer Protection shield icon for listing cards and buyer protection marks.
 * Uses a distinct vibrant teal default color (#007782) that implements its documented vibrant variant.
 */
export function VintedShieldIcon({
  color,
  strokeColor,
  ...props
}: VintedShieldIconProps) {
  const iconColor = color ?? strokeColor ?? VINTED_SHIELD_COLOR;
  return <ShieldCheckIcon color={iconColor} {...props} />;
}

