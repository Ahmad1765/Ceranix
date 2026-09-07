import React from 'react';
import { ShieldCheckIcon, type ShieldCheckIconProps } from './ShieldCheckIcon';

export type VintedShieldIconProps = ShieldCheckIconProps;

/**
 * Vinted-style vibrant Buyer Protection shield icon for listing cards and buyer protection marks.
 */
export function VintedShieldIcon(props: VintedShieldIconProps) {
  return <ShieldCheckIcon {...props} />;
}

